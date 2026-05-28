import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "samples.csv");
const DEFAULT_OUTPUT = path.join(ROOT, "app", "trained-model.js");
const FEATURE_KEYS = ["brightness", "saturation", "contrast", "warm", "titleHook", "hasFace", "hasBeforeAfter"];
const DEFAULT_WEIGHTS = {
  brightness: 0.14,
  saturation: 0.14,
  contrast: 0.16,
  warm: 0.08,
  titleHook: 0.2,
  hasFace: 0.14,
  hasBeforeAfter: 0.14,
};

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split("="))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key.replace(/^--/, ""), value]),
);

const inputPath = path.resolve(ROOT, args.get("input") || DEFAULT_INPUT);
const outputPath = path.resolve(ROOT, args.get("output") || DEFAULT_OUTPUT);

function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
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

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase();
}

function rowValue(row, headers, names) {
  const wanted = names.map(normalizeHeader);
  const index = headers.findIndex((header) => wanted.includes(normalizeHeader(header)));
  return index >= 0 ? row[index] : "";
}

function parseNumber(value) {
  const normalized = String(value || "").replace("%", "").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value) {
  return ["1", "true", "是", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function titleHookScore(title) {
  let score = 44;
  const hooks = ["避坑", "清单", "前后", "真实", "测评", "省钱", "必看", "不要", "适合", "医美", "抗衰", "术前", "术后", "面诊", "恢复"];
  hooks.forEach((word) => {
    if (String(title || "").includes(word)) score += 5;
  });
  if (title.length >= 10 && title.length <= 24) score += 10;
  if (/\d/.test(title)) score += 7;
  if (/[?？!！]/.test(title)) score += 4;
  return clamp(score, 20, 100);
}

function numberFeature(row, headers, names, fallback) {
  const value = parseNumber(rowValue(row, headers, names));
  return value === null ? fallback : clamp(value, 0, 100);
}

function buildFeatures(row, headers, title) {
  return {
    brightness: numberFeature(row, headers, ["brightness", "brightness_score", "visual_brightness", "亮度"], 60),
    saturation: numberFeature(row, headers, ["saturation", "saturation_score", "visual_saturation", "饱和度"], 60),
    contrast: numberFeature(row, headers, ["contrast", "contrast_score", "visual_contrast", "对比度", "反差"], 60),
    warm: numberFeature(row, headers, ["warm", "warm_score", "warmth", "暖色"], 50),
    titleHook: numberFeature(row, headers, ["title_hook", "titleHook", "title_score", "标题钩子"], titleHookScore(title)),
    hasFace: parseBoolean(rowValue(row, headers, ["has_face", "face", "人物主体", "真人主体"])) ? 100 : 0,
    hasBeforeAfter: parseBoolean(rowValue(row, headers, ["has_before_after", "before_after", "对比", "前后对比"])) ? 100 : 0,
  };
}

function inferTags(features, title = "") {
  const tags = [];
  if (features.titleHook >= 70) tags.push("强钩子标题");
  if (features.contrast >= 62) tags.push("高反差");
  if (features.saturation >= 62) tags.push("高饱和");
  if (features.brightness >= 62) tags.push("明亮清晰");
  if (features.hasFace >= 100) tags.push("人物主体");
  if (features.hasBeforeAfter >= 100) tags.push("对比展示");
  if (title.includes("避坑")) tags.push("避坑内容");
  if (title.includes("术前")) tags.push("术前决策");
  return tags.slice(0, 5);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stddev(values) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => Math.pow(value - mean, 2))));
}

function pearson(xs, ys) {
  const xMean = average(xs);
  const yMean = average(ys);
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;
  xs.forEach((x, index) => {
    const xd = x - xMean;
    const yd = ys[index] - yMean;
    numerator += xd * yd;
    xDenominator += xd * xd;
    yDenominator += yd * yd;
  });
  const denominator = Math.sqrt(xDenominator * yDenominator);
  return denominator ? numerator / denominator : 0;
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (!total) return DEFAULT_WEIGHTS;
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, Number(((weights[key] || 0) / total).toFixed(4))]));
}

function trainWeights(samples) {
  const ctrs = samples.map((sample) => sample.ctr);
  const enabled = FEATURE_KEYS.filter((key) => stddev(samples.map((sample) => sample.features[key])) > 0.001);
  if (!enabled.length) return DEFAULT_WEIGHTS;

  const baseWeights = normalizeWeights(
    Object.fromEntries(FEATURE_KEYS.map((key) => [key, enabled.includes(key) ? DEFAULT_WEIGHTS[key] : 0])),
  );
  const correlationWeights = Object.fromEntries(
    FEATURE_KEYS.map((key) => {
      if (!enabled.includes(key)) return [key, 0];
      const corr = Math.abs(pearson(samples.map((sample) => sample.features[key]), ctrs));
      return [key, Math.max(corr, 0.02)];
    }),
  );
  const normalizedCorrelation = normalizeWeights(correlationWeights);
  const blend = samples.length >= 20 ? 0.65 : 0.35;
  return normalizeWeights(
    Object.fromEntries(
      FEATURE_KEYS.map((key) => [
        key,
        (baseWeights[key] || 0) * (1 - blend) + (normalizedCorrelation[key] || 0) * blend,
      ]),
    ),
  );
}

function featureAverages(samples) {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [
      key,
      Math.round(average(samples.map((sample) => sample.features[key]))),
    ]),
  );
}

async function main() {
  const text = await fs.readFile(inputPath, "utf8");
  const rows = parseDelimited(text, inputPath.endsWith(".tsv") ? "\t" : ",");
  const headers = rows[0] || [];
  const samples = rows
    .slice(1)
    .map((row) => {
      const ctr = parseNumber(rowValue(row, headers, ["ctr", "点击率", "真实点击率"]));
      const title = rowValue(row, headers, ["title", "标题", "note_title"]) || rowValue(row, headers, ["filename", "file"]);
      const project = rowValue(row, headers, ["project", "项目", "category"]);
      const sourceId = rowValue(row, headers, ["filename", "file", "image_file", "图片文件", "id"]);
      if (!Number.isFinite(ctr) || ctr <= 0) return null;
      const features = buildFeatures(row, headers, title);
      return {
        id: sourceId || title,
        sourceId,
        name: title || sourceId || "历史样本",
        title,
        project,
        ctr: Number(ctr.toFixed(2)),
        features,
        tags: inferTags(features, title),
      };
    })
    .filter(Boolean);

  if (!samples.length) {
    throw new Error(`No valid samples found in ${inputPath}`);
  }

  const sortedByCtr = [...samples].sort((a, b) => b.ctr - a.ctr);
  const topCount = Math.max(1, Math.ceil(samples.length * 0.3));
  const highCtrSamples = sortedByCtr.slice(0, topCount);
  const model = {
    version: "offline-ctr-v1",
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, inputPath),
    sampleCount: samples.length,
    featureKeys: FEATURE_KEYS,
    weights: trainWeights(samples),
    baselineCtr: Number(average(samples.map((sample) => sample.ctr)).toFixed(2)),
    minCtr: Math.min(...samples.map((sample) => sample.ctr)),
    maxCtr: Math.max(...samples.map((sample) => sample.ctr)),
    highCtrProfile: {
      sampleCount: highCtrSamples.length,
      avgCtr: Number(average(highCtrSamples.map((sample) => sample.ctr)).toFixed(2)),
      features: featureAverages(highCtrSamples),
      examples: highCtrSamples.slice(0, 5).map((sample) => ({
        name: sample.name,
        ctr: sample.ctr,
        tags: sample.tags,
      })),
    },
    samples,
  };

  const js = `// Generated by scripts/train_ctr_model.mjs. Do not edit by hand.\nwindow.REDNOTE_CTR_MODEL = ${JSON.stringify(model, null, 2)};\n`;
  await fs.writeFile(outputPath, js, "utf8");
  console.log(`trained ${samples.length} samples -> ${path.relative(ROOT, outputPath)}`);
  console.log(`baseline CTR ${model.baselineCtr}%, range ${model.minCtr}-${model.maxCtr}%`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
