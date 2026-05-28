#!/usr/bin/env python3
import argparse
import csv
import math
from pathlib import Path
from statistics import mean, pstdev

from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "samples.csv"
DEFAULT_OUTPUT = ROOT / "data" / "samples_local_features.csv"
IMAGE_DIR = ROOT / "data" / "images"


HOOK_WORDS = [
    "避坑",
    "清单",
    "前后",
    "真实",
    "测评",
    "省钱",
    "必看",
    "不要",
    "适合",
    "医美",
    "抗衰",
    "术前",
    "术后",
    "面诊",
    "恢复",
    "妈生",
    "爆改",
    "模板",
    "逆袭",
    "显脸小",
]


def clamp(value, minimum=0, maximum=100):
    return max(minimum, min(maximum, value))


def yes(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "是"}


def title_hook_score(title):
    title = title or ""
    score = 44
    for word in HOOK_WORDS:
        if word in title:
            score += 5
    if 10 <= len(title) <= 28:
        score += 10
    if any(ch.isdigit() for ch in title):
        score += 7
    if any(ch in title for ch in "!?！？"):
        score += 4
    return round(clamp(score, 20, 100))


def image_features(path):
    with Image.open(path) as image:
        image = image.convert("RGB")
        image.thumbnail((192, 192))
        pixels = list(image.getdata())
        width, height = image.size

    lumas = []
    saturations = []
    warm_votes = 0
    red_values = []
    green_values = []
    blue_values = []

    for r, g, b in pixels:
        red_values.append(r)
        green_values.append(g)
        blue_values.append(b)
        maximum = max(r, g, b)
        minimum = min(r, g, b)
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        lumas.append(luma)
        saturations.append(0 if maximum == 0 else (maximum - minimum) / maximum)
        if r > b * 1.08 and r > g * 0.92:
            warm_votes += 1

    brightness = mean(lumas) / 255 * 100
    saturation = mean(saturations) * 100
    contrast = clamp(pstdev(lumas) / 72 * 100)
    warm = warm_votes / max(len(pixels), 1) * 100

    # Lightweight edge density: high local luma changes usually mean clearer text/subject boundaries.
    gray = lumas
    edge_hits = 0
    edge_checks = 0
    for y in range(height - 1):
        offset = y * width
        next_offset = (y + 1) * width
        for x in range(width - 1):
            current = gray[offset + x]
            if abs(current - gray[offset + x + 1]) > 28:
                edge_hits += 1
            if abs(current - gray[next_offset + x]) > 28:
                edge_hits += 1
            edge_checks += 2
    edge_density = edge_hits / max(edge_checks, 1) * 100

    color_spread = (pstdev(red_values) + pstdev(green_values) + pstdev(blue_values)) / 3 / 64 * 100
    subject_prominence = clamp(contrast * 0.45 + edge_density * 0.45 + saturation * 0.18)
    composition_clarity = clamp(brightness * 0.25 + contrast * 0.42 + edge_density * 0.45)
    thumbnail_legibility = clamp(brightness * 0.24 + contrast * 0.34 + edge_density * 0.5 + saturation * 0.12)

    return {
        "brightness": round(clamp(brightness), 2),
        "saturation": round(clamp(saturation), 2),
        "contrast": round(clamp(contrast), 2),
        "warm": round(clamp(warm), 2),
        "subject_prominence": round(subject_prominence, 2),
        "composition_clarity": round(composition_clarity, 2),
        "thumbnail_legibility": round(thumbnail_legibility, 2),
        "color_complexity": round(clamp(color_spread), 2),
    }


def enrich_row(row):
    title = row.get("title", "")
    has_face = yes(row.get("has_face"))
    has_before_after = yes(row.get("has_before_after"))
    features = image_features(IMAGE_DIR / row["filename"])
    hook_strength = title_hook_score(title)
    text_density = clamp(len(title) * 3.2, 20, 88)
    before_after_strength = 78 if has_before_after else 24
    medical_trust_signal = clamp(hook_strength * 0.24 + (34 if has_face else 12) + (22 if has_before_after else 0))
    emotional_tension = clamp(hook_strength * 0.55 + (26 if any(ch in title for ch in "!?！？") else 8))

    return {
        **row,
        **features,
        "title_hook": hook_strength,
        "text_density": round(text_density, 2),
        "medical_trust_signal": round(medical_trust_signal, 2),
        "hook_strength": hook_strength,
        "before_after_strength": before_after_strength,
        "emotional_tension": round(emotional_tension, 2),
    }


def main():
    parser = argparse.ArgumentParser(description="Extract local image features without API calls.")
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    rows = list(csv.DictReader(input_path.open(encoding="utf-8-sig")))
    enriched = []
    missing = []

    for row in rows:
      image_path = IMAGE_DIR / row.get("filename", "")
      if not image_path.exists():
          missing.append(row.get("filename", ""))
          continue
      enriched.append(enrich_row(row))

    if missing:
        raise SystemExit(f"Missing images: {', '.join(missing[:20])}")
    if not enriched:
        raise SystemExit("No rows enriched.")

    headers = list(enriched[0].keys())
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(enriched)

    ctrs = [float(row["ctr"]) for row in enriched if row.get("ctr")]
    print(f"wrote {len(enriched)} rows -> {output_path.relative_to(ROOT)}")
    print(f"ctr avg {mean(ctrs):.2f}%, min {min(ctrs):.2f}%, max {max(ctrs):.2f}%")


if __name__ == "__main__":
    main()
