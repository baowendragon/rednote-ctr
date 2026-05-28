import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "samples.csv");
const DEFAULT_OUTPUT = path.join(ROOT, "app", "trained-model.js");
const FEATURE_KEYS = [
  "brightness",
  "saturation",
  "contrast",
  "warm",
  "titleHook",
  "hasFace",
  "hasBeforeAfter",
  "textDensity",
  "subjectProminence",
  "medicalTrustSignal",
  "hookStrength",
  "beforeAfterStrength",
  "emotionalTension",
  "compositionClarity",
  "thumbnailLegibility",
];
const DEFAULT_WEIGHTS = {
  brightness: 0.07,
  saturation: 0.06,
  contrast: 0.07,
  warm: 0.04,
  titleHook: 0.09,
  hasFace: 0.07,
  hasBeforeAfter: 0.07,
  textDensity: 0.08,
  subjectProminence: 0.09,
  medicalTrustSignal: 0.07,
  hookStrength: 0.1,
  beforeAfterStrength: 0.06,
  emotionalTension: 0.05,
  compositionClarity: 0.08,
  thumbnailLegibility: 0.1,
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
  const titleScore = titleHookScore(title);
  const hasFace = parseBoolean(rowValue(row, headers, ["has_face", "face", "人物主体", "真人主体"])) ? 100 : 0;
  const hasBeforeAfter = parseBoolean(rowValue(row, headers, ["has_before_after", "before_after", "对比", "前后对比"])) ? 100 : 0;
  return {
    brightness: numberFeature(row, headers, ["brightness", "brightness_score", "visual_brightness", "亮度"], 60),
    saturation: numberFeature(row, headers, ["saturation", "saturation_score", "visual_saturation", "饱和度"], 60),
    contrast: numberFeature(row, headers, ["contrast", "contrast_score", "visual_contrast", "对比度", "反差"], 60),
    warm: numberFeature(row, headers, ["warm", "warm_score", "warmth", "暖色"], 50),
    titleHook: numberFeature(row, headers, ["title_hook", "titleHook", "title_score", "标题钩子"], titleScore),
    hasFace,
    hasBeforeAfter,
    textDensity: numberFeature(row, headers, ["text_density", "textDensity", "文字密度"], clamp(title.length * 3.2, 20, 88)),
    subjectProminence: numberFeature(row, headers, ["subject_prominence", "subjectProminence", "主体突出"], hasFace ? 72 : 48),
    medicalTrustSignal: numberFeature(row, headers, ["medical_trust_signal", "medicalTrustSignal", "信任感"], hasFace ? 66 : 46),
    hookStrength: numberFeature(row, headers, ["hook_strength", "hookStrength", "钩子强度"], titleScore),
    beforeAfterStrength: numberFeature(row, headers, ["before_after_strength", "beforeAfterStrength", "对比强度"], hasBeforeAfter ? 78 : 24),
    emotionalTension: numberFeature(row, headers, ["emotional_tension", "emotionalTension", "情绪张力"], /[!！?？]/.test(title) ? 72 : 45),
    compositionClarity: numberFeature(row, headers, ["composition_clarity", "compositionClarity", "构图清晰"], 60),
    thumbnailLegibility: numberFeature(row, headers, ["thumbnail_legibility", "thumbnailLegibility", "缩略图可读性"], 60),
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
  if (features.textDensity >= 70) tags.push("信息密度高");
  if (features.thumbnailLegibility >= 72) tags.push("缩略图清晰");
  if (features.medicalTrustSignal >= 72) tags.push("信任信号强");
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

function quantile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
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

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) continue;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n] || 0);
}

function predictWithCoefficients(features, regression) {
  return regression.intercept + FEATURE_KEYS.reduce((sum, key) => {
    return sum + (regression.coefficients[key] || 0) * ((features[key] || 0) / 100);
  }, 0);
}

function regressionDiagnostics(samples, regression, targetValue = (sample) => sample.ctr) {
  const actual = samples.map(targetValue);
  const predicted = samples.map((sample) => predictWithCoefficients(sample.features, regression));
  const yMean = average(actual);
  const residuals = actual.map((value, index) => value - predicted[index]);
  const sse = residuals.reduce((sum, value) => sum + value * value, 0);
  const sst = actual.reduce((sum, value) => sum + Math.pow(value - yMean, 2), 0);
  const mae = average(residuals.map((value) => Math.abs(value)));
  const rmse = Math.sqrt(average(residuals.map((value) => value * value)));
  return {
    r2: Number((sst ? 1 - sse / sst : 0).toFixed(4)),
    mae: Number(mae.toFixed(3)),
    rmse: Number(rmse.toFixed(3)),
  };
}

function trainRegression(samples) {
  const lambda = samples.length >= 100 ? 0.8 : 1.4;
  const ctrs = samples.map((sample) => sample.ctr);
  const targetLower = samples.length >= 100 ? quantile(ctrs, 0.02) : Math.min(...ctrs);
  const targetUpper = samples.length >= 100 ? quantile(ctrs, 0.95) : Math.max(...ctrs);
  const targetValue = (sample) => clamp(sample.ctr, targetLower, targetUpper);
  const p = FEATURE_KEYS.length + 1;
  const xtx = Array.from({ length: p }, () => Array(p).fill(0));
  const xty = Array(p).fill(0);

  for (const sample of samples) {
    const x = [1, ...FEATURE_KEYS.map((key) => (sample.features[key] || 0) / 100)];
    const y = targetValue(sample);
    for (let i = 0; i < p; i += 1) {
      xty[i] += x[i] * y;
      for (let j = 0; j < p; j += 1) xtx[i][j] += x[i] * x[j];
    }
  }

  for (let i = 1; i < p; i += 1) xtx[i][i] += lambda;
  const beta = solveLinearSystem(xtx, xty);
  const regression = {
    type: "ridge-linear-regression",
    lambda,
    target: "winsorized-ctr",
    targetRange: {
      lower: Number(targetLower.toFixed(3)),
      upper: Number(targetUpper.toFixed(3)),
    },
    intercept: Number((beta[0] || 0).toFixed(4)),
    coefficients: Object.fromEntries(FEATURE_KEYS.map((key, index) => [key, Number((beta[index + 1] || 0).toFixed(4))])),
  };
  regression.diagnostics = regressionDiagnostics(samples, regression, targetValue);
  regression.rawDiagnostics = regressionDiagnostics(samples, regression);
  return regression;
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
    regression: trainRegression(samples),
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
