import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "samples.csv");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "samples_ai_features.csv");
const DEFAULT_CACHE = path.join(ROOT, "data", "ai_feature_cache.json");
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4.1-mini";

async function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    try {
      const text = await fs.readFile(path.join(ROOT, fileName), "utf8");
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .forEach((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const rawValue = line.slice(index + 1).trim();
          const value = rawValue.replace(/^['"]|['"]$/g, "");
          if (key && !process.env[key]) process.env[key] = value;
        });
    } catch {
      // Optional local secret file.
    }
  }
}

await loadLocalEnv();

const FEATURE_COLUMNS = [
  "brightness",
  "saturation",
  "contrast",
  "warm",
  "title_hook",
  "has_face",
  "has_before_after",
  "text_density",
  "subject_prominence",
  "medical_trust_signal",
  "hook_strength",
  "before_after_strength",
  "emotional_tension",
  "composition_clarity",
  "thumbnail_legibility",
  "ai_tags",
  "ai_notes",
];

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split("="))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key.replace(/^--/, ""), value]),
);

const inputPath = path.resolve(ROOT, args.get("input") || DEFAULT_INPUT);
const outputPath = path.resolve(ROOT, args.get("output") || DEFAULT_OUTPUT);
const cachePath = path.resolve(ROOT, args.get("cache") || DEFAULT_CACHE);
const limit = Number(args.get("limit") || 0);
const start = Number(args.get("start") || 0);
const apiKey = process.env.OPENAI_API_KEY || "";
const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const model = process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL;
const apiMode = process.env.OPENAI_API_MODE || "chat";

function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function readCsv(text) {
  const rows = parseDelimited(text, ",");
  const headers = rows[0] || [];
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function writeCsv(headers, rows) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n") + "\n";
}

function inferMime(filePath, bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  if (String(filePath).toLowerCase().endsWith(".png")) return "image/png";
  if (String(filePath).toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function imageDataUrl(filename) {
  const filePath = path.join(ROOT, "data", "images", filename);
  const bytes = await fs.readFile(filePath);
  return `data:${inferMime(filePath, bytes)};base64,${bytes.toString("base64")}`;
}

function score(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function boolText(value) {
  if (typeof value === "boolean") return value ? "是" : "否";
  return ["1", "true", "是", "yes", "y"].includes(String(value || "").trim().toLowerCase()) ? "是" : "否";
}

function normalize(raw) {
  return {
    brightness: score(raw.brightness, 60),
    saturation: score(raw.saturation, 60),
    contrast: score(raw.contrast, 60),
    warm: score(raw.warm, 50),
    title_hook: score(raw.title_hook ?? raw.hook_strength, 55),
    has_face: boolText(raw.has_face),
    has_before_after: boolText(raw.has_before_after),
    text_density: score(raw.text_density, 50),
    subject_prominence: score(raw.subject_prominence, 55),
    medical_trust_signal: score(raw.medical_trust_signal, 50),
    hook_strength: score(raw.hook_strength ?? raw.title_hook, 55),
    before_after_strength: score(raw.before_after_strength, boolText(raw.has_before_after) === "是" ? 78 : 24),
    emotional_tension: score(raw.emotional_tension, 50),
    composition_clarity: score(raw.composition_clarity, 60),
    thumbnail_legibility: score(raw.thumbnail_legibility, 60),
    ai_tags: Array.isArray(raw.ai_tags) ? raw.ai_tags.slice(0, 8).join(" / ") : String(raw.ai_tags || ""),
    ai_notes: String(raw.ai_notes || "").slice(0, 200),
  };
}

function prompt(row) {
  return `你是小红书医美封面 CTR 回归建模的图片特征标注员。请只输出 JSON，不要解释。

任务：根据封面图片和元数据，提取可用于预测 CTR 的稳定特征。所有分数字段为 0-100，越高代表越强。不要根据真实 CTR 反推分数，要只看图片和标题本身。

元数据：
标题：${row.title || ""}
项目：${row.project || ""}

输出 JSON 字段：
{
  "brightness": 0-100,
  "saturation": 0-100,
  "contrast": 0-100,
  "warm": 0-100,
  "title_hook": 0-100,
  "has_face": true/false,
  "has_before_after": true/false,
  "text_density": 0-100,
  "subject_prominence": 0-100,
  "medical_trust_signal": 0-100,
  "hook_strength": 0-100,
  "before_after_strength": 0-100,
  "emotional_tension": 0-100,
  "composition_clarity": 0-100,
  "thumbnail_legibility": 0-100,
  "ai_tags": ["最多8个短标签"],
  "ai_notes": "一句话说明这张封面的点击特征"
}`;
}

function outputText(payload) {
  if (payload.output_text) return payload.output_text;
  if (payload.choices?.[0]?.message?.content) return payload.choices[0].message.content;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => item.text || "")
    .join("\n");
}

function parseJson(text) {
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`model did not return JSON: ${cleaned.slice(0, 180)}`);
    return JSON.parse(match[0]);
  }
}

async function requestChat(row, dataUrl) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt(row) },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`chat API ${response.status}: ${await response.text()}`);
  return parseJson(outputText(await response.json()));
}

async function requestResponses(row, dataUrl) {
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt(row) },
            { type: "input_image", image_url: dataUrl, detail: "low" },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`responses API ${response.status}: ${await response.text()}`);
  return parseJson(outputText(await response.json()));
}

async function analyze(row) {
  const dataUrl = await imageDataUrl(row.filename);
  const raw = apiMode === "responses" ? await requestResponses(row, dataUrl) : await requestChat(row, dataUrl);
  return normalize(raw);
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const rows = readCsv(await fs.readFile(inputPath, "utf8"));
  const selected = rows.slice(start, limit ? start + limit : undefined);
  const cache = await loadCache();

  for (let index = 0; index < selected.length; index += 1) {
    const row = selected[index];
    const key = `${row.filename}:${row.title}:${row.ctr}`;
    if (!cache[key]) {
      console.log(`[${start + index + 1}/${rows.length}] ${row.filename}`);
      cache[key] = await analyze(row);
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    }
  }

  const outputRows = rows.map((row) => ({ ...row, ...(cache[`${row.filename}:${row.title}:${row.ctr}`] || {}) }));
  const headers = [...Object.keys(rows[0] || {}), ...FEATURE_COLUMNS.filter((column) => !(column in (rows[0] || {})))];
  await fs.writeFile(outputPath, writeCsv(headers, outputRows), "utf8");
  console.log(`wrote ${outputRows.length} rows -> ${path.relative(ROOT, outputPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
