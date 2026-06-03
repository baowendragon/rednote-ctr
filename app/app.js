const MAX_COVERS = 20;
const TOP_PICK_COUNT = 3;
const MIN_TRAINING_SAMPLES = 3;
const UPLOAD_IMAGE_MAX_WIDTH = 900;
const UPLOAD_IMAGE_MAX_HEIGHT = 1200;
const UPLOAD_IMAGE_QUALITY = 0.78;
const TEST_IMAGE_MAX_WIDTH = 720;
const TEST_IMAGE_MAX_HEIGHT = 960;
const TEST_IMAGE_QUALITY = 0.72;
const PROJECT_SAMPLE_CSV = "../data/samples.csv";
const PROJECT_IMAGE_DIR = "../data/images/";
const STORAGE_KEY = "rednoteCtrLibrary";
const TEST_STORAGE_KEY = "rednoteCtrTests";
const CANDIDATE_STORAGE_KEY = "rednoteCtrCandidates";
const API_ENABLED = location.protocol === "http:" || location.protocol === "https:";
const STATIC_CTR_MODEL = window.REDNOTE_CTR_MODEL || null;
const DEFAULT_FEATURE_WEIGHTS = {
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

const $ = (selector) => document.querySelector(selector);
const coverGrid = $("#coverGrid");
const emptyState = $("#emptyState");
const template = $("#coverCardTemplate");
const savedCandidateState = loadCandidateState();

const state = {
  covers: savedCandidateState.covers,
  library: loadLibrary(),
  tests: loadTests(),
  selectedCoverIds: new Set(savedCandidateState.selectedCoverIds),
  sort: "score",
  optimizationCoverId: null,
  selectedTestId: null,
  pendingSampleImage: null,
  pendingImportFile: null,
  currentView: "front",
};

const industryBenchmark = { base: 6.4, label: "医美" };
const CTR_DISPLAY_MIN = 2.4;
const CTR_DISPLAY_MAX = 13.8;
const COVER_TYPES = [
  { id: "person", label: "真人单人照", description: "真人主体明确，适合对比表情、清晰度和信任感。" },
  { id: "doctorTrust", label: "医生/顾客合照", description: "医生、机构或面诊场景强化专业背书。" },
  { id: "beforeAfter", label: "术前术后对比", description: "前后变化或结果对比是主要点击钩子。" },
  { id: "detail", label: "局部细节特写", description: "鼻、眼、斑、下颌线等部位细节是画面重点。" },
  { id: "knowledge", label: "项目科普/清单", description: "标题和文字承载主要信息，适合功课、避坑、清单类内容。" },
  { id: "treatment", label: "治疗过程/仪器", description: "注射、仪器、操作过程或项目体验是主要信息。" },
  { id: "recovery", label: "恢复记录", description: "恢复期、术后反馈、阶段变化等时间线内容。" },
  { id: "textInfo", label: "文字信息图", description: "文字信息占主导，图片主体较弱或偏海报化。" },
];
const COVER_TYPE_BY_ID = Object.fromEntries(COVER_TYPES.map((type) => [type.id, type]));

const mockCovers = [
  ["抗衰项目对比封面", "#e9415a", "#fff0ca", "抗衰前后", "真实案例"],
  ["热玛吉功课封面", "#157a78", "#f4f7fb", "热玛吉避坑", "术前必看"],
  ["水光项目清单封面", "#2a66d9", "#ff8b5c", "水光清单", "新手功课"],
  ["下颌线改善封面", "#7b5cff", "#f2d58a", "下颌线变化", "30天反馈"],
  ["医生面诊封面", "#1d2129", "#7cc9c8", "面诊问题", "问这8个"],
  ["祛斑项目封面", "#c87514", "#fde6d0", "祛斑别乱做", "避坑指南"],
  ["法令纹改善封面", "#e9415a", "#f6d4df", "法令纹救星", "真实变化"],
  ["光子嫩肤封面", "#157a78", "#d7f3ee", "光子嫩肤", "做前须知"],
  ["医美预算封面", "#2a66d9", "#fff0ca", "预算怎么花", "少走弯路"],
  ["敏感肌医美封面", "#a23b72", "#f8dbe8", "敏感肌能做吗", "真实测评"],
  ["瘦脸项目封面", "#0d6b6f", "#ffcf99", "瘦脸怎么选", "项目对比"],
  ["术后护理封面", "#4f5d75", "#c7e7ff", "术后护理", "恢复更快"],
];

function loadLibrary() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    return JSON.parse(saved).filter((item) => item.features && Number.isFinite(Number(item.ctr)));
  } catch {
    return [];
  }
}

function saveLibrary() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.library.slice(0, 500)));
  } catch {
    // Large image data can exceed browser storage; keep the in-memory session usable.
  }
}

function loadTests() {
  try {
    const saved = localStorage.getItem(TEST_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveTests() {
  try {
    localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(state.tests.slice(0, 100)));
  } catch {
    // Published tests are persisted by the backend in online mode.
  }
}

function loadCandidateState() {
  try {
    const saved = sessionStorage.getItem(CANDIDATE_STORAGE_KEY);
    if (!saved) return { covers: [], selectedCoverIds: [] };
    const parsed = JSON.parse(saved);
    const covers = Array.isArray(parsed.covers) ? parsed.covers.slice(0, MAX_COVERS) : [];
    const coverIds = new Set(covers.map((cover) => cover.id));
    const selectedCoverIds = Array.isArray(parsed.selectedCoverIds)
      ? parsed.selectedCoverIds.filter((id) => coverIds.has(id))
      : [];
    return { covers, selectedCoverIds };
  } catch {
    return { covers: [], selectedCoverIds: [] };
  }
}

function saveCandidateState() {
  try {
    sessionStorage.setItem(
      CANDIDATE_STORAGE_KEY,
      JSON.stringify({
        covers: state.covers.slice(0, MAX_COVERS),
        selectedCoverIds: [...state.selectedCoverIds],
      }),
    );
  } catch {
    // Large uploaded images can exceed browser storage. The current page state still works.
  }
}

async function apiRequest(path, options = {}) {
  if (!API_ENABLED) throw new Error("API is unavailable in file mode");
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function refreshTestsFromApi() {
  if (!API_ENABLED) return;
  try {
    const payload = await apiRequest("/api/tests");
    state.tests = payload.tests || [];
    saveTests();
    renderTestDashboard();
  } catch {
    // Local static servers without the API still work through localStorage.
  }
}

function sanitizeUtf16(value) {
  return Array.from(String(value ?? ""))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(char.length === 1 && code >= 0xd800 && code <= 0xdfff);
    })
    .join("");
}

function safeTruncate(value, length) {
  return Array.from(sanitizeUtf16(value)).slice(0, length).join("");
}

function escapeHtml(value) {
  return sanitizeUtf16(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function makeMockCover(primary, secondary, title, badge) {
  const safeTitle = escapeHtml(title);
  const safeBadge = escapeHtml(badge);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${primary}"/>
          <stop offset="1" stop-color="${secondary}"/>
        </linearGradient>
      </defs>
      <rect width="900" height="1200" fill="url(#bg)"/>
      <rect x="72" y="82" width="756" height="1036" rx="42" fill="rgba(255,255,255,.86)"/>
      <rect x="132" y="172" width="328" height="54" rx="27" fill="${primary}"/>
      <text x="156" y="209" fill="#fff" font-size="31" font-family="Arial, sans-serif" font-weight="700">${safeBadge}</text>
      <text x="132" y="430" fill="#1d2129" font-size="82" font-family="Arial, sans-serif" font-weight="900">${safeTitle}</text>
      <text x="132" y="526" fill="#1d2129" font-size="82" font-family="Arial, sans-serif" font-weight="900">值得点开</text>
      <rect x="132" y="780" width="636" height="178" rx="28" fill="#1d2129"/>
      <text x="174" y="855" fill="#fff" font-size="42" font-family="Arial, sans-serif" font-weight="800">高信息密度</text>
      <text x="174" y="917" fill="#fff" font-size="38" font-family="Arial, sans-serif">主体清晰 · 钩子明确</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(sanitizeUtf16(svg))}`;
}

function getInputs() {
  return {
    title: $("#titleInput").value.trim(),
    project: "",
    categoryLabel: industryBenchmark.label,
    audience: $("#audienceInput").value.trim(),
    hasFace: $("#hasFaceInput").checked,
    hasBeforeAfter: $("#hasBeforeAfterInput").checked,
  };
}

function getSampleInputs() {
  return {
    title: $("#sampleTitleInput").value.trim(),
    project: $("#sampleProjectInput").value.trim(),
    categoryLabel: industryBenchmark.label,
    hasFace: $("#sampleHasFaceInput").checked,
    hasBeforeAfter: $("#sampleHasBeforeAfterInput").checked,
  };
}

function titleHookScore(title) {
  let score = 44;
  const hooks = ["避坑", "清单", "前后", "真实", "测评", "省钱", "必看", "不要", "适合", "医美", "抗衰", "术前", "术后", "面诊", "恢复"];
  hooks.forEach((word) => {
    if (title.includes(word)) score += 5;
  });
  if (title.length >= 10 && title.length <= 24) score += 10;
  if (/\d/.test(title)) score += 7;
  if (/[?？!！]/.test(title)) score += 4;
  return clamp(score, 20, 100);
}

async function analyzeImage(src) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let brightness = 0;
  let saturation = 0;
  let contrastSum = 0;
  let warmPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    brightness += (r + g + b) / 3;
    saturation += max === 0 ? 0 : (max - min) / max;
    contrastSum += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
    if (r > g * 1.08 && r > b * 1.08) warmPixels += 1;
  }

  const pixels = data.length / 4;
  return {
    brightnessScore: scoreRange(brightness / pixels, 78, 196),
    saturationScore: clamp((saturation / pixels) * 130, 0, 100),
    contrastScore: clamp((contrastSum / pixels / 255) * 92, 0, 100),
    warmScore: clamp((warmPixels / pixels) * 210, 0, 100),
  };
}

function scoreRange(value, min, max) {
  const center = (min + max) / 2;
  const half = (max - min) / 2;
  return clamp(100 - (Math.abs(value - center) / half) * 48, 22, 100);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图片无法读取：${src}`));
    image.src = src;
  });
}

async function compressImage(src, options = {}) {
  const image = await loadImage(src);
  const maxWidth = options.maxWidth || UPLOAD_IMAGE_MAX_WIDTH;
  const maxHeight = options.maxHeight || UPLOAD_IMAGE_MAX_HEIGHT;
  const quality = options.quality || UPLOAD_IMAGE_QUALITY;
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function compressImageSafe(src, options = {}) {
  try {
    return await compressImage(src, options);
  } catch {
    return src;
  }
}

function buildFeatures(visual, inputs) {
  const title = inputs.title || "";
  const titleHook = Math.round(inputs.titleScore ?? titleHookScore(title));
  const hasFace = inputs.hasFace ? 100 : 0;
  const hasBeforeAfter = inputs.hasBeforeAfter ? 100 : 0;
  const features = {
    brightness: Math.round(visual.brightnessScore),
    saturation: Math.round(visual.saturationScore),
    contrast: Math.round(visual.contrastScore),
    warm: Math.round(visual.warmScore),
    titleHook,
    hasFace,
    hasBeforeAfter,
    textDensity: clamp(Math.round(title.length * 3.2), 20, 88),
    subjectProminence: clamp(Math.round(visual.contrastScore * 0.42 + visual.brightnessScore * 0.18 + (hasFace ? 34 : 8)), 0, 100),
    medicalTrustSignal: clamp(Math.round(titleHook * 0.24 + (hasFace ? 34 : 12) + (hasBeforeAfter ? 22 : 0)), 0, 100),
    hookStrength: titleHook,
    beforeAfterStrength: hasBeforeAfter ? 78 : 24,
    emotionalTension: clamp(Math.round(titleHook * 0.55 + (/[!！?？]/.test(title) ? 26 : 8)), 0, 100),
    compositionClarity: clamp(Math.round(visual.brightnessScore * 0.35 + visual.contrastScore * 0.45 + 12), 0, 100),
    thumbnailLegibility: clamp(Math.round(visual.brightnessScore * 0.28 + visual.contrastScore * 0.42 + visual.saturationScore * 0.18 + 8), 0, 100),
  };
  features.coverType = classifyCoverType(features, inputs);
  return features;
}

function inferTags(features, inputs = {}) {
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
  if ((inputs.title || "").includes("避坑")) tags.push("避坑内容");
  if ((inputs.title || "").includes("术前")) tags.push("术前决策");
  return tags.slice(0, 5);
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function classifyCoverType(features = {}, inputs = {}) {
  const text = sanitizeUtf16(`${inputs.title || inputs.name || ""} ${inputs.project || inputs.category || ""} ${(inputs.tags || []).join(" ")}`);
  const hasFace = Number(features.hasFace || 0) >= 80;
  const hasBeforeAfter = Number(features.hasBeforeAfter || 0) >= 80;
  const textDensity = Number(features.textDensity || 0);

  if (hasBeforeAfter || includesAny(text, ["前后", "对比", "变化", "术前术后", "before", "after"])) {
    return COVER_TYPE_BY_ID.beforeAfter;
  }
  if (includesAny(text, ["医生", "院长", "主任", "面诊", "机构", "顾问", "合照", "案例见证"])) {
    return COVER_TYPE_BY_ID.doctorTrust;
  }
  if (includesAny(text, ["恢复", "术后", "复诊", "反馈", "记录", "第1天", "第7天", "30天", "一个月", "三个月"])) {
    return COVER_TYPE_BY_ID.recovery;
  }
  if (includesAny(text, ["注射", "治疗", "仪器", "操作", "过程", "水光", "热玛吉", "超声炮", "光子", "射频", "针", "打针", "刷酸"])) {
    return COVER_TYPE_BY_ID.treatment;
  }
  if (includesAny(text, ["清单", "避坑", "功课", "攻略", "必问", "预算", "科普", "指南", "怎么选", "问题", "新手"])) {
    return COVER_TYPE_BY_ID.knowledge;
  }
  if (includesAny(text, ["鼻", "眼", "下颌", "法令", "斑", "痘", "泪沟", "毛孔", "轮廓", "嘴", "唇", "黑眼圈", "皮肤", "额头"])) {
    return COVER_TYPE_BY_ID.detail;
  }
  if (!hasFace && textDensity >= 72) return COVER_TYPE_BY_ID.textInfo;
  return hasFace ? COVER_TYPE_BY_ID.person : COVER_TYPE_BY_ID.textInfo;
}

function calculateScore(visual, context = {}) {
  const inputs = { ...getInputs(), name: context.name || visual.name || "" };
  const titleScore = titleHookScore(inputs.title);
  const features = buildFeatures(visual, { ...inputs, titleScore });
  const prediction = predictCtr(features);
  return {
    score: ctrToScore(prediction.ctr),
    ctr: prediction.ctr,
    regressionCtr: prediction.regressionCtr,
    similarityCtr: prediction.similarityCtr,
    confidence: prediction.confidence,
    similarSamples: prediction.similarSamples,
    coverType: prediction.coverType,
    typeSampleCount: prediction.typeSampleCount,
    typeReferenceMode: prediction.typeReferenceMode,
    predictionMode: prediction.mode,
    titleScore,
    features,
    ...visual,
  };
}

function buildReason(metrics) {
  if (metrics.predictionMode === "offline") {
    if (metrics.typeReferenceMode === "typed") {
      return "系统先在同类型历史高 CTR 样本里找相似封面，再结合离线回归模型做保守校准。";
    }
    return "同类型样本暂少，系统使用全库相似样本兜底，并结合离线回归模型做保守校准。";
  }
  if (metrics.predictionMode === "trained") {
    return `基于本地样本库相似封面估算，并按当前封面类型做参考。`;
  }
  return `训练样本少于 ${MIN_TRAINING_SAMPLES} 条，当前仅用临时基准估算。先导入真实 CTR 样本，预测会更可靠。`;
}

function getLocalTrainingSamples() {
  return state.library.filter((item) => item.features && Number.isFinite(Number(item.ctr)));
}

function getStaticTrainingSamples() {
  return STATIC_CTR_MODEL?.samples?.filter((item) => item.features && Number.isFinite(Number(item.ctr))) || [];
}

function shouldUseLocalTrainingSamples(localSamples = getLocalTrainingSamples(), staticSamples = getStaticTrainingSamples()) {
  const staticCount = Number(STATIC_CTR_MODEL?.sampleCount || staticSamples.length || 0);
  return localSamples.length >= MIN_TRAINING_SAMPLES && (!staticCount || localSamples.length > staticCount);
}

function getTrainingSamples() {
  const localSamples = getLocalTrainingSamples();
  const staticSamples = getStaticTrainingSamples();
  return shouldUseLocalTrainingSamples(localSamples, staticSamples) ? localSamples : staticSamples;
}

function getFeatureWeights() {
  if (!shouldUseLocalTrainingSamples() && STATIC_CTR_MODEL?.weights) return STATIC_CTR_MODEL.weights;
  return DEFAULT_FEATURE_WEIGHTS;
}

function predictRegressionCtr(features) {
  const regression = !shouldUseLocalTrainingSamples() ? STATIC_CTR_MODEL?.regression : null;
  if (!regression?.coefficients) return null;
  const raw = Object.entries(regression.coefficients).reduce((sum, [key, coefficient]) => {
    return sum + Number(coefficient || 0) * ((features[key] || 0) / 100);
  }, Number(regression.intercept || 0));
  const min = Number(STATIC_CTR_MODEL?.minCtr || 1);
  const max = Number(STATIC_CTR_MODEL?.maxCtr || Math.max(min, industryBenchmark.base * 3));
  return clamp(raw, min * 0.72, max * 1.04);
}

function calibrateCtrForDisplay(rawCtr) {
  const raw = Number(rawCtr);
  if (!Number.isFinite(raw)) return industryBenchmark.base;
  const modelBaseline = Number(STATIC_CTR_MODEL?.baselineCtr || industryBenchmark.base * 2.5);
  const ratio = clamp(raw / Math.max(modelBaseline, 1), 0.2, 3.2);
  const calibrated = industryBenchmark.base * (0.62 + 0.58 * Math.pow(ratio, 0.62));
  return Number(clamp(calibrated, CTR_DISPLAY_MIN, CTR_DISPLAY_MAX).toFixed(1));
}

function sampleCoverType(sample) {
  if (sample.coverType?.id) return sample.coverType;
  return classifyCoverType(sample.features || {}, {
    title: sample.title || sample.name,
    project: sample.project || sample.category,
    tags: sample.tags || [],
  });
}

function rankSamplesBySimilarity(samples, features, weights, limit = 5) {
  return samples
    .map((sample) => {
      const distance = featureDistance(features, sample.features, weights);
      const similarity = 1 / Math.pow(distance + 0.08, 2);
      return { ...sample, coverType: sampleCoverType(sample), distance, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function weightedCtr(rankedSamples) {
  const totalWeight = rankedSamples.reduce((sum, sample) => sum + sample.similarity, 0);
  if (!totalWeight) return industryBenchmark.base;
  return rankedSamples.reduce((sum, sample) => sum + Number(sample.ctr) * sample.similarity, 0) / totalWeight;
}

function predictCtr(features) {
  const localSamples = getLocalTrainingSamples();
  const staticSamples = getStaticTrainingSamples();
  const useLocalSamples = shouldUseLocalTrainingSamples(localSamples, staticSamples);
  const samples = useLocalSamples ? localSamples : staticSamples;
  const mode = useLocalSamples ? "trained" : "offline";
  const coverType = features.coverType || classifyCoverType(features);
  if (samples.length < MIN_TRAINING_SAMPLES) {
    return {
      ctr: fallbackCtr(features, samples),
      confidence: Math.max(18, samples.length * 12),
      similarSamples: samples.slice(0, 3),
      coverType,
      typeSampleCount: 0,
      typeReferenceMode: "global",
      mode: samples.length ? mode : "fallback",
    };
  }

  const weights = getFeatureWeights();
  const typedSamples = samples.filter((sample) => sampleCoverType(sample).id === coverType.id);
  const useTypedReference = typedSamples.length >= 5;
  const globalRanked = rankSamplesBySimilarity(samples, features, weights, 5);
  const typedRanked = useTypedReference ? rankSamplesBySimilarity(typedSamples, features, weights, 5) : [];
  const ranked = useTypedReference ? typedRanked : globalRanked;
  const globalSimilarityCtr = weightedCtr(globalRanked);
  const typeSimilarityCtr = useTypedReference ? weightedCtr(typedRanked) : globalSimilarityCtr;
  const regressionCtr = predictRegressionCtr(features);
  const rawCtr =
    regressionCtr === null
      ? typeSimilarityCtr * (useTypedReference ? 0.78 : 0.4) + globalSimilarityCtr * (useTypedReference ? 0.22 : 0.6)
      : regressionCtr * (useTypedReference ? 0.25 : 0.55) + typeSimilarityCtr * (useTypedReference ? 0.6 : 0) + globalSimilarityCtr * (useTypedReference ? 0.15 : 0.45);
  const ctr = calibrateCtrForDisplay(rawCtr);
  const avgSimilarity = ranked.reduce((sum, sample) => sum + sample.similarity, 0) / ranked.length;
  const regressionLift = regressionCtr === null ? 0 : 9;
  const typeLift = useTypedReference ? Math.min(12, Math.round(typedSamples.length / 5)) : 0;
  const confidence = clamp(Math.round(Math.min(samples.length / 30, 1) * 34 + Math.min(avgSimilarity / 18, 1) * 38 + regressionLift + typeLift), 30, 95);

  return {
    ctr,
    rawCtr: Number(rawCtr.toFixed(1)),
    regressionCtr: regressionCtr === null ? null : calibrateCtrForDisplay(regressionCtr),
    similarityCtr: calibrateCtrForDisplay(typeSimilarityCtr),
    confidence,
    similarSamples: ranked,
    coverType,
    typeSampleCount: typedSamples.length,
    typeReferenceMode: useTypedReference ? "typed" : "global",
    mode,
  };
}

function featureDistance(a, b, weights = DEFAULT_FEATURE_WEIGHTS) {
  const weightedSum = Object.entries(weights).reduce((sum, [key, weight]) => {
    const diff = ((a[key] ?? 0) - (b[key] ?? 0)) / 100;
    return sum + Math.pow(diff, 2) * weight;
  }, 0);
  return Math.sqrt(weightedSum);
}

function fallbackCtr(features, samples) {
  if (samples.length) {
    const avgCtr = samples.reduce((sum, sample) => sum + Number(sample.ctr), 0) / samples.length;
    return calibrateCtrForDisplay(avgCtr);
  }

  if (STATIC_CTR_MODEL?.baselineCtr) {
    return calibrateCtrForDisplay(STATIC_CTR_MODEL.baselineCtr);
  }

  const raw =
    features.brightness * 0.18 +
    features.saturation * 0.18 +
    features.contrast * 0.18 +
    features.warm * 0.07 +
    features.titleHook * 0.22 +
    features.hasFace * 0.08 +
    features.hasBeforeAfter * 0.09;
  return Number(clamp(industryBenchmark.base * (0.72 + raw / 120), CTR_DISPLAY_MIN, CTR_DISPLAY_MAX).toFixed(1));
}

function ctrToScore(ctr) {
  return clamp(Math.round(((ctr - CTR_DISPLAY_MIN) / (CTR_DISPLAY_MAX - CTR_DISPLAY_MIN)) * 70 + 25), 25, 98);
}

async function addCover(name, image) {
  if (state.covers.length >= MAX_COVERS) {
    showCoverLimitNotice();
    return;
  }
  const visual = await analyzeImage(image);
  const metrics = calculateScore(visual, { name });
  state.covers.push({
    id: crypto.randomUUID(),
    name,
    image,
    createdAt: Date.now(),
    ...metrics,
    reason: buildReason(metrics),
  });
  saveCandidateState();
  render();
}

function recalculateAll() {
  state.covers = state.covers.map((cover) => {
    const metrics = calculateScore(cover, { name: cover.name });
    return { ...cover, ...metrics, reason: buildReason(metrics) };
  });
  saveCandidateState();
  render();
}

function sortedCovers() {
  return [...state.covers].sort((a, b) => {
    if (state.sort === "time") return a.createdAt - b.createdAt;
    return b.ctr - a.ctr;
  });
}

function rankedCovers() {
  return [...state.covers].sort((a, b) => b.ctr - a.ctr);
}

function remainingCoverSlots() {
  return Math.max(0, MAX_COVERS - state.covers.length);
}

function showCoverLimitNotice() {
  alert(`候选封面已经满了 ${MAX_COVERS} 张。请先点击左上角“↺”重置候选封面，再上传新图片。`);
}

function render() {
  renderCovers();
  renderRecommendation();
  renderOptimizationPanel();
  renderTestPublishPanel();
  renderModelStatus();
  renderUploadNote();
  renderSampleCount();
  renderAdmin();
  renderTestDashboard();
}

function renderCovers() {
  const covers = sortedCovers();
  const topPickIds = new Set(rankedCovers().slice(0, TOP_PICK_COUNT).map((cover) => cover.id));
  coverGrid.innerHTML = "";
  emptyState.style.display = covers.length ? "none" : "grid";
  coverGrid.style.display = covers.length ? "grid" : "none";

  covers.forEach((cover, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".cover-rank").textContent = index + 1;
    node.classList.toggle("top-pick", topPickIds.has(cover.id));
    node.querySelector("img").src = cover.image;
    node.querySelector(".cover-name").textContent = cover.name;
    node.querySelector(".ctr-value").textContent = `${cover.ctr}%`;
    node.querySelector(".meter span").style.width = `${cover.score}%`;
    node.querySelector(".reason").textContent = cover.reason;
    node.querySelector(".optimize-cover-btn").dataset.coverId = cover.id;
    node.querySelector(".select-test-btn").dataset.coverId = cover.id;
    node.querySelector(".generate-cover-btn").dataset.coverId = cover.id;
    node.querySelector(".select-test-btn").textContent = state.selectedCoverIds.has(cover.id) ? "已加入内测" : "加入内测";
    node.classList.toggle("selected-test", state.selectedCoverIds.has(cover.id));

    const metrics = [
      ["封面类型", cover.coverType?.label || "通用封面"],
      ["同类样本", cover.typeSampleCount || 0],
      ["视觉亮度", cover.brightnessScore],
      ["色彩刺激", cover.saturationScore],
      ["主体反差", cover.contrastScore],
      ["模型置信", cover.confidence],
    ];

    node.querySelector(".metrics").innerHTML = metrics
      .map(([label, value]) => {
        const displayValue = Number.isFinite(Number(value)) ? Math.round(Number(value)) : escapeHtml(value);
        return `<div><dt>${label}</dt><dd>${displayValue}</dd></div>`;
      })
      .join("");
    coverGrid.appendChild(node);
  });
}

function renderRecommendation() {
  const ranked = rankedCovers();
  const topPicks = ranked.slice(0, TOP_PICK_COUNT);
  const best = topPicks[0];
  const recommendation = $("#recommendation");
  $("#bestCtr").textContent = best ? `${best.ctr}%` : "--";

  if (!best) {
    recommendation.innerHTML = `
      <strong>等待封面分析</strong>
      <p>先维护真实样本库，再上传候选封面，系统会选出预估点击率最高的前三张。</p>
    `;
    return;
  }

  const inputs = getInputs();
  const topList = topPicks
    .map((cover, index) => `${index + 1}. ${escapeHtml(cover.name)}：${escapeHtml(cover.coverType?.label || "通用封面")}，校准预估 ${cover.ctr}%`)
    .join("<br>");
  const typeSummary = best.typeReferenceMode === "typed"
    ? `已优先参考 ${best.typeSampleCount} 张「${escapeHtml(best.coverType?.label || "同类型")}」历史封面。`
    : `「${escapeHtml(best.coverType?.label || "同类型")}」样本不足，已使用全库相似样本兜底。`;
  const categoryLabel = escapeHtml(inputs.categoryLabel || industryBenchmark.label);
  const audience = escapeHtml(inputs.audience || "未填写");
  const sampleWarning =
    getTrainingSamples().length < MIN_TRAINING_SAMPLES
      ? `<p>当前训练样本不足 ${MIN_TRAINING_SAMPLES} 条，预测只是临时估算。请先录入带真实 CTR 的历史优质封面。</p>`
      : "";
  recommendation.innerHTML = `
    <strong>优先测试前三张</strong>
    <p>行业固定为${categoryLabel}，目标人群是${audience}。</p>
    <div class="callout">${topList}</div>
    <span class="confidence">模型置信度 ${best.confidence}%</span>
    <p>首推 ${escapeHtml(best.name)}。${typeSummary}${escapeHtml(best.reason)}</p>
    ${sampleWarning}
    <p>下一步建议：把前三张作为 A/B/C 版测试，用真实曝光和点击数据回填样本库。</p>
  `;
}

function getCoverById(id) {
  return state.covers.find((cover) => cover.id === id);
}

function buildOptimizationAdvice(cover) {
  const advice = [];
  if (cover.brightnessScore < 58) advice.push("提高文字区和主体亮度，让信息流缩略图里第一眼更清楚。");
  if (cover.contrastScore < 58) advice.push("增强主体和背景反差，减少浅色背景上的浅色文字。");
  if (cover.saturationScore < 52) advice.push("适度提高关键色饱和度，优先强化标题底色、项目标签或对比箭头。");
  if (cover.titleScore < 68) advice.push("把标题改成医美用户更容易点开的钩子，例如避坑、前后变化、术前必问、恢复期真实反馈。");
  if (!$("#hasBeforeAfterInput").checked) advice.push("如果素材真实合规，可以增加对比结构，但不要伪造医美效果或夸大术后结果。");
  if (!$("#hasFaceInput").checked) advice.push("优先加入真人面部局部、医生面诊场景或项目部位示意，提高信任感。");
  return advice.slice(0, 4);
}

function buildImageEditPrompt(cover) {
  const advice = buildOptimizationAdvice(cover).join(" ");
  return `基于原图做小红书医美封面微调，保留真实人物与项目效果，不改变脸型、皮肤状态或医疗结果。优化目标：提升点击率和信息流识别度。具体修改：${advice} 保持竖版 3:4 构图，标题清晰，避免虚假前后对比、夸大疗效和过度磨皮。`;
}

function renderOptimizationPanel() {
  const panel = $("#optimizationPanel");
  const cover = getCoverById(state.optimizationCoverId) || rankedCovers()[0];
  if (!cover) {
    panel.innerHTML = `
      <strong>选择封面后生成</strong>
      <p>这里会输出适合图片编辑模型执行的微调指令。</p>
    `;
    return;
  }

  const advice = buildOptimizationAdvice(cover);
  const adviceItems = advice.length
    ? advice.map((item) => `<li>${item}</li>`).join("")
    : "<li>这张封面基础较好，建议只做轻量级文字层级和主体清晰度优化。</li>";

  panel.innerHTML = `
    <strong>${cover.name}</strong>
    <p>预估点击率 ${cover.ctr}%，建议先做 2-3 个轻改版本再回到评分器复测。</p>
    <ul class="optimization-list">${adviceItems}</ul>
    <div class="prompt-box">${buildImageEditPrompt(cover)}</div>
  `;
}

function getSelectedCovers() {
  return rankedCovers().filter((cover) => state.selectedCoverIds.has(cover.id));
}

function renderTestPublishPanel() {
  const panel = $("#testPublishPanel");
  const note = $("#selectedTestNote");
  if (!panel || !note) return;
  const selected = getSelectedCovers();
  note.textContent = `已选择 ${selected.length} 张封面。`;

  if (!selected.length) {
    panel.innerHTML = `
      <strong>等待选择封面</strong>
      <p>在候选封面卡片里点击“加入内测”，再发布成小红书样式双列测试页。</p>
    `;
    return;
  }

  const list = selected.map((cover) => `<li><span>${cover.name}</span><strong>${cover.ctr}%</strong></li>`).join("");
  panel.innerHTML = `
    <strong>准备发布 ${selected.length} 张</strong>
    <ul class="similar-list">${list}</ul>
    <p>发布后，每张封面会在测试页记录曝光和点击，用实际点击率排序。</p>
  `;
}

function renderTestDashboard() {
  const list = $("#testList");
  const results = $("#testResults");
  const count = $("#testCount");
  if (!list || !results || !count) return;
  count.textContent = state.tests.length;

  if (!state.tests.length) {
    list.innerHTML = `
      <div class="recommendation">
        <strong>还没有内测</strong>
        <p>先在前台上传候选封面，选择 2 张以上后发布内测。</p>
      </div>
    `;
    results.innerHTML = `
      <div class="recommendation">
        <strong>等待点击数据</strong>
        <p>用户访问内测页并点击封面后，这里会显示 CTR 排名。</p>
      </div>
    `;
    return;
  }

  let selectedTest = state.tests.find((test) => test.id === state.selectedTestId);
  if (!selectedTest) {
    selectedTest = state.tests[0];
    state.selectedTestId = selectedTest.id;
  }

  list.innerHTML = state.tests
    .map((test) => {
      const url = makeTestUrl(test.id);
      const isActive = test.id === selectedTest.id;
      return `
        <article class="test-item${isActive ? " active" : ""}" data-test-id="${test.id}">
          <div>
            <strong>${escapeHtml(test.title)}</strong>
            <span>${formatDateTime(test.createdAt)} · ${test.covers.length} 张封面</span>
          </div>
          <div class="test-item-actions">
            <button class="secondary-button view-results-btn" data-test-id="${test.id}" type="button">${isActive ? "当前查看" : "查看结果"}</button>
            <button class="secondary-button open-test-btn" data-test-id="${test.id}" type="button">打开内测页</button>
            <button class="secondary-button copy-test-btn" data-url="${url}" type="button">复制链接</button>
          </div>
        </article>
      `;
    })
    .join("");

  const ranked = rankTestCovers(selectedTest);
  results.innerHTML = `
    <strong>${escapeHtml(selectedTest.title)}</strong>
    <p>当前查看：${formatDateTime(selectedTest.createdAt)}，按实测点击率排序。</p>
    <div class="result-table">
      ${ranked
        .map(
          (cover, index) => `
            <div class="result-row">
              <span>${index + 1}</span>
              <img src="${cover.image}" alt="${escapeHtml(cover.name)}">
              <div>
                <strong>${escapeHtml(cover.name)}</strong>
                <small>曝光 ${cover.views || 0} · 点击 ${cover.clicks || 0}</small>
              </div>
              <b>${testCtr(cover)}%</b>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function testCtr(cover) {
  if (!cover.views) return "0.0";
  return ((cover.clicks || 0) / cover.views * 100).toFixed(1);
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function rankTestCovers(test) {
  return [...test.covers].sort((a, b) => Number(testCtr(b)) - Number(testCtr(a)));
}

function makeTestUrl(testId) {
  if (location.protocol === "file:") return `${location.href.split("#")[0]}#test=${testId}`;
  return `${location.origin}/test/${testId}`;
}

async function publishTest() {
  const selected = getSelectedCovers();
  if (selected.length < 2) {
    alert("请至少选择 2 张封面做内测。");
    return;
  }

  const publishButton = $("#publishTestBtn");
  const originalText = publishButton.textContent;
  publishButton.disabled = true;
  publishButton.textContent = "发布中...";
  $("#selectedTestNote").textContent = `正在发布 ${selected.length} 张封面...`;

  let payload;
  try {
    payload = {
      title: $("#testTitleInput").value.trim() || getInputs().title || "封面内测",
      description: $("#testDescInput").value.trim() || "点击你最想打开的一张封面",
      covers: await Promise.all(
        selected.map(async (cover) => ({
          name: cover.name,
          image: await compressImageSafe(cover.image, {
            maxWidth: TEST_IMAGE_MAX_WIDTH,
            maxHeight: TEST_IMAGE_MAX_HEIGHT,
            quality: TEST_IMAGE_QUALITY,
          }),
          predictedCtr: cover.ctr,
          sourceCoverId: cover.id,
        })),
      ),
    };

    const test = await apiRequest("/api/tests", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    state.tests = [test, ...state.tests.filter((item) => item.id !== test.id)];
    state.selectedTestId = test.id;
    state.selectedCoverIds.clear();
    saveCandidateState();
    saveTests();
    render();
    history.pushState({}, "", makeTestUrl(test.id));
    showPublicTest(test);
  } catch (error) {
    if (!API_ENABLED) {
      const test = {
        id: crypto.randomUUID(),
        ...payload,
        createdAt: Date.now(),
        covers: payload.covers.map((cover) => ({
          id: crypto.randomUUID(),
          ...cover,
          views: 0,
          clicks: 0,
        })),
      };
      state.tests.unshift(test);
      state.selectedTestId = test.id;
      state.selectedCoverIds.clear();
      saveCandidateState();
      saveTests();
      render();
      history.pushState({}, "", makeTestUrl(test.id));
      showPublicTest(test);
      return;
    }

    $("#selectedTestNote").textContent = `已选择 ${selected.length} 张封面。`;
    alert(`发布失败：${error.message || "请稍后重试"}`);
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = originalText;
  }
}

function renderUploadNote() {
  const remaining = remainingCoverSlots();
  $("#uploadNote").textContent = remaining
    ? `当前 ${state.covers.length}/${MAX_COVERS} 张，上传后会自动压缩，系统会选出前三张。`
    : `当前 ${MAX_COVERS}/${MAX_COVERS} 张，候选封面已满，请先重置后再上传。`;
  $("#coverInput").disabled = remaining === 0;
  $("#addMockBtn").disabled = remaining === 0;
  $("#addMockBtn").textContent = remaining === 0 ? "候选封面已满" : "加入 12 张示例候选";
}

function renderSampleCount() {
  $("#sampleCount").textContent = getTrainingSamples().length;
}

function modelGeneratedDate() {
  if (!STATIC_CTR_MODEL?.generatedAt) return "未记录";
  try {
    return new Date(STATIC_CTR_MODEL.generatedAt).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return "未记录";
  }
}

function typeDistribution(samples) {
  const counts = new Map();
  samples.forEach((sample) => {
    const type = sampleCoverType(sample);
    counts.set(type.id, { ...type, count: (counts.get(type.id)?.count || 0) + 1 });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function renderModelStatus() {
  renderModelStatusInto("#modelStatus");
  renderModelStatusInto("#adminModelStatus");
}

function renderModelStatusInto(selector) {
  const target = $(selector);
  if (!target) return;
  const localSamples = getLocalTrainingSamples();
  const staticSamples = getStaticTrainingSamples();
  const useLocal = shouldUseLocalTrainingSamples(localSamples, staticSamples);
  const samples = useLocal ? localSamples : staticSamples;
  const types = typeDistribution(samples).slice(0, 5);
  const diagnostics = STATIC_CTR_MODEL?.regression?.diagnostics;

  if (!samples.length) {
    target.innerHTML = `
      <div class="recommendation">
        <strong>模型未加载</strong>
        <p>请确认 trained-model.js 已部署，或在本地重新运行离线训练脚本。</p>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="status-grid">
      <div><span>模型来源</span><strong>${useLocal ? "本地临时样本" : "线上离线模型"}</strong></div>
      <div><span>训练样本</span><strong>${samples.length}</strong></div>
      <div><span>预测策略</span><strong>同类型优先</strong></div>
      <div><span>展示口径</span><strong>保守校准 CTR</strong></div>
    </div>
    <p class="status-text">最近训练：${modelGeneratedDate()}。线上只加载训练产物，不在用户上传时调用大模型。</p>
    ${diagnostics ? `<p class="status-text">回归诊断：MAE ${diagnostics.mae}，R² ${diagnostics.r2}。当前更适合做多图排序和前三筛选。</p>` : ""}
    <div class="type-list">
      ${types.map((type) => `<span>${escapeHtml(type.label)} <b>${type.count}</b></span>`).join("")}
    </div>
  `;
}

function renderAdmin() {
  $("#adminSampleCount").textContent = getTrainingSamples().length;
}

async function createLocalOptimizedVariant(cover, variantIndex = 0) {
  const image = await loadImage(cover.image);
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  const filters = [
    "brightness(1.12) contrast(1.12) saturate(1.16)",
    "brightness(1.05) contrast(1.22) saturate(1.08)",
    "brightness(1.15) contrast(1.08) saturate(1.28)",
  ];
  ctx.filter = filters[variantIndex % filters.length];
  ctx.drawImage(image, x, y, width, height);
  ctx.filter = "none";

  const accent = ["#e9415a", "#157a78", "#2a66d9"][variantIndex % 3];
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, 58, 72, 784, 132, 28);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, 82, 100, 160, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Arial, sans-serif";
  ctx.fillText("高点击版", 105, 136);
  ctx.fillStyle = "#1d2129";
  ctx.font = "900 46px Arial, sans-serif";
  ctx.fillText(safeTruncate($("#titleInput").value.trim(), 14) || safeTruncate(cover.name, 14), 270, 136);
  ctx.font = "700 28px Arial, sans-serif";
  ctx.fillText("主体更清晰 · 钩子更明确", 270, 176);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 886, 1186);
  return canvas.toDataURL("image/jpeg", UPLOAD_IMAGE_QUALITY);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function generateOptimizedVariants(coverId, count = 2) {
  const cover = getCoverById(coverId) || rankedCovers()[0];
  if (!cover) return;
  for (let index = 0; index < count; index += 1) {
    const image = await createLocalOptimizedVariant(cover, index);
    await addCover(`${cover.name} 轻改版${index + 1}`, image);
  }
  state.optimizationCoverId = cover.id;
  render();
}

async function addTrainingSample({ name, project, ctr, image, inputs, sourceId }) {
  const existingIndex = sourceId ? state.library.findIndex((sample) => sample.sourceId === sourceId) : -1;
  const visual = await analyzeImage(image);
  const titleScore = titleHookScore(inputs.title || name);
  const features = buildFeatures(visual, { ...inputs, titleScore });
  const sample = {
    id: existingIndex >= 0 ? state.library[existingIndex].id : crypto.randomUUID(),
    sourceId: sourceId || "",
    name,
    project,
    category: industryBenchmark.label,
    ctr: Number(ctr),
    image,
    title: inputs.title || name,
    hasFace: Boolean(inputs.hasFace),
    hasBeforeAfter: Boolean(inputs.hasBeforeAfter),
    features,
    tags: inferTags(features, inputs),
    createdAt: existingIndex >= 0 ? state.library[existingIndex].createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  if (existingIndex >= 0) {
    state.library[existingIndex] = sample;
  } else {
    state.library.unshift(sample);
  }
  saveLibrary();
  recalculateAll();
}

async function runLearningAnalysis() {
  const status = $("#learningStatus");
  if (!state.library.length && STATIC_CTR_MODEL?.sampleCount) {
    status.innerHTML = `
      <strong>正在使用离线模型</strong>
      <p>当前线上模型已内置 ${STATIC_CTR_MODEL.sampleCount} 条训练样本。要更新模型，请先更新 data/samples.csv，再在本地运行 node scripts/train_ctr_model.mjs 并重新部署。</p>
    `;
    return;
  }

  status.innerHTML = `
    <strong>分析中</strong>
    <p>正在重新提取样本特征并生成识别标签...</p>
  `;

  const refreshed = [];
  for (const sample of state.library) {
    try {
      const visual = await analyzeImage(sample.image);
      const inputs = {
        title: sample.title || sample.name,
        project: sample.project || "",
        hasFace: sample.hasFace,
        hasBeforeAfter: sample.hasBeforeAfter,
      };
      const features = buildFeatures(visual, { ...inputs, titleScore: titleHookScore(inputs.title) });
      refreshed.push({ ...sample, features, tags: inferTags(features, inputs), updatedAt: Date.now() });
    } catch {
      refreshed.push({ ...sample, tags: [...(sample.tags || []), "图片解析失败"].slice(0, 5) });
    }
  }

  state.library = refreshed;
  saveLibrary();
  recalculateAll();
  status.innerHTML = `
    <strong>学习分析完成</strong>
    <p>已更新 ${state.library.length} 条样本的视觉特征和自动标签，新上传封面会基于最新样本库预测。</p>
  `;
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
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

function rowValue(row, headers, names) {
  const normalized = names.map((name) => name.toLowerCase());
  const index = headers.findIndex((header) => normalized.includes(header.toLowerCase()));
  return index >= 0 ? row[index] : "";
}

function parseBoolean(value) {
  return ["1", "true", "是", "yes", "y"].includes(String(value).trim().toLowerCase());
}

function resolveImageSource(row, headers) {
  const direct = rowValue(row, headers, ["cover_data_url", "cover_url", "image_url", "image", "封面"]);
  if (direct.startsWith("data:") || direct.startsWith("http://") || direct.startsWith("https://")) return direct;
  const filename = rowValue(row, headers, ["filename", "file", "image_file", "图片文件"]);
  const path = direct || filename;
  if (!path) return "";
  if (path.startsWith("../") || path.startsWith("./")) return path;
  if (path.startsWith("data/images/")) return `../${path}`;
  if (path.includes("/")) return path;
  return `${PROJECT_IMAGE_DIR}${path}`;
}

async function importRows(rows) {
  if (rows.length < 2) return { imported: 0, skipped: 0 };
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const image = resolveImageSource(row, headers);
    const ctr = Number(rowValue(row, headers, ["ctr", "click_rate", "点击率"]));
    const title = rowValue(row, headers, ["title", "标题"]) || `导入样本 ${Date.now()}`;
    const project = rowValue(row, headers, ["project", "项目"]) || "医美";
    const hasFace = parseBoolean(rowValue(row, headers, ["has_face", "人物主体"]));
    const hasBeforeAfter = parseBoolean(rowValue(row, headers, ["has_before_after", "前后对比"]));
    const sourceId = rowValue(row, headers, ["id", "filename", "file", "image_file", "cover_url", "image"]);

    if (!image || !Number.isFinite(ctr) || ctr <= 0) {
      skipped += 1;
      continue;
    }

    try {
      await addTrainingSample({
        name: title,
        project,
        ctr,
        image,
        sourceId,
        inputs: { title, project, hasFace, hasBeforeAfter },
      });
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  return { imported, skipped };
}

async function importDelimitedText(text, delimiter) {
  return importRows(parseDelimited(text, delimiter));
}

async function loadProjectSamples() {
  const status = $("#projectImportStatus");
  status.textContent = "正在读取 data/samples.csv...";
  try {
    const response = await fetch(`${PROJECT_SAMPLE_CSV}?t=${Date.now()}`);
    if (!response.ok) throw new Error("samples.csv not found");
    const result = await importDelimitedText(await response.text(), ",");
    status.textContent = `加载完成：新增/更新 ${result.imported} 条，跳过 ${result.skipped} 条。`;
  } catch {
    status.textContent = "加载失败：请用本地服务打开页面，例如在项目根目录运行 python3 -m http.server 5173 后访问 /app/。";
  }
}

function getRouteTestId() {
  const pathMatch = location.pathname.match(/^\/test\/([^/]+)$/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  const hashMatch = location.hash.match(/^#test=(.+)$/);
  return hashMatch ? hashMatch[1] : "";
}

function showPublicTestFromHash() {
  const testId = getRouteTestId();
  const app = document.querySelector(".app-shell");
  const page = $("#publicTestPage");
  if (!testId) {
    app.classList.remove("hidden");
    page.classList.add("hidden");
    return;
  }

  let test = state.tests.find((item) => item.id === testId);
  if (!test) {
    if (API_ENABLED) {
      apiRequest(`/api/tests/${testId}`)
        .then((payload) => {
          state.tests.unshift(payload);
          saveTests();
          showPublicTest(payload);
        })
        .catch(() => {
          app.classList.remove("hidden");
          page.classList.add("hidden");
          alert("没有找到这场内测。");
          history.replaceState({}, "", "/app/");
        });
      return;
    }
    app.classList.remove("hidden");
    page.classList.add("hidden");
    alert("没有找到这场内测。当前静态版内测数据保存在本机浏览器。");
    location.hash = "";
    return;
  }

  showPublicTest(test);
}

function showPublicTest(test) {
  const app = document.querySelector(".app-shell");
  const page = $("#publicTestPage");
  app.classList.add("hidden");
  page.classList.remove("hidden");
  renderPublicTest(test);
}

async function renderPublicTest(test) {
  $("#publicTestTitle").textContent = test.title;
  $("#publicTestDesc").textContent = test.description;
  const viewKey = `rednoteCtrViewed:${test.id}`;
  if (!sessionStorage.getItem(viewKey)) {
    try {
      test = await apiRequest(`/api/tests/${test.id}/view`, { method: "POST", body: "{}" });
      const index = state.tests.findIndex((item) => item.id === test.id);
      if (index >= 0) state.tests[index] = test;
    } catch {
      test.covers = test.covers.map((cover) => ({ ...cover, views: (cover.views || 0) + 1 }));
    }
    sessionStorage.setItem(viewKey, "1");
    saveTests();
    renderTestDashboard();
  }

  $("#publicFeed").innerHTML = test.covers
    .map(
      (cover) => `
        <article class="rednote-card" data-test-id="${test.id}" data-cover-id="${cover.id}">
          <img src="${cover.image}" alt="${cover.name}">
          <div>
            <strong>${cover.name}</strong>
            <p>${test.description}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

async function recordPublicClick(testId, coverId) {
  const test = state.tests.find((item) => item.id === testId);
  if (!test) return;
  const cover = test.covers.find((item) => item.id === coverId);
  if (!cover) return;
  try {
    const updated = await apiRequest(`/api/tests/${testId}/click`, {
      method: "POST",
      body: JSON.stringify({ coverId }),
    });
    const index = state.tests.findIndex((item) => item.id === testId);
    if (index >= 0) state.tests[index] = updated;
  } catch {
    cover.clicks = (cover.clicks || 0) + 1;
  }
  saveTests();
  renderTestDashboard();
  $("#clickedCoverImage").src = cover.image;
  $("#clickedCoverTitle").textContent = cover.name;
  $("#clickModal").classList.remove("hidden");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function inferImageMime(buffer, fallbackType = "") {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  const head = new TextDecoder("utf-8").decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return fallbackType.startsWith("image/") ? fallbackType : "";
}

async function readFile(file) {
  const buffer = await file.arrayBuffer();
  const mime = inferImageMime(buffer, file.type);
  if (!mime) throw new Error(`无法识别图片格式：${file.name}`);
  return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
}

async function readCompressedFile(file) {
  const image = await readFile(file);
  return compressImageSafe(image, {
    maxWidth: UPLOAD_IMAGE_MAX_WIDTH,
    maxHeight: UPLOAD_IMAGE_MAX_HEIGHT,
    quality: UPLOAD_IMAGE_QUALITY,
  });
}

$("#coverInput").addEventListener("change", async (event) => {
  if (state.covers.length && confirm(`当前已有 ${state.covers.length} 张候选封面，是否先清空再上传这批新图片？\n确定：清空后上传；取消：继续追加。`)) {
    clearCandidateCovers({ ask: false });
  }

  const remaining = remainingCoverSlots();
  if (remaining === 0) {
    showCoverLimitNotice();
    event.target.value = "";
    renderUploadNote();
    return;
  }
  const files = [...event.target.files].slice(0, remaining);
  if (event.target.files.length > remaining) alert(`最多还能加入 ${remaining} 张，本次会自动取前 ${remaining} 张。`);
  const failed = [];
  for (const file of files) {
    try {
      $("#uploadNote").textContent = `正在压缩：${file.name}`;
      const image = await readCompressedFile(file);
      await addCover(file.name.replace(/\.[^.]+$/, ""), image);
    } catch {
      failed.push(file.name);
    }
  }
  event.target.value = "";
  renderUploadNote();
  if (failed.length) alert(`以下图片没有上传成功，请确认是 PNG/JPG/WebP/SVG 图片：${failed.join("、")}`);
});

$("#addMockBtn").addEventListener("click", async () => {
  const remaining = remainingCoverSlots();
  if (remaining === 0) {
    showCoverLimitNotice();
    return;
  }
  const samples = mockCovers.slice(0, remaining);
  if (samples.length < mockCovers.length) alert(`当前最多还能加入 ${remaining} 张示例候选。`);
  for (const [name, primary, secondary, title, badge] of samples) {
    await addCover(name, makeMockCover(primary, secondary, title, badge));
  }
});

document.querySelectorAll(".mode-switch button").forEach((button) => {
  button.addEventListener("click", () => {
    state.currentView = button.dataset.view;
    document.querySelectorAll(".mode-switch button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelectorAll(".front-view").forEach((item) => item.classList.toggle("hidden", state.currentView !== "front"));
    document.querySelectorAll(".admin-view").forEach((item) => item.classList.toggle("hidden", state.currentView !== "admin"));
    document.querySelectorAll(".test-view").forEach((item) => item.classList.toggle("hidden", state.currentView !== "test"));
    render();
  });
});

$("#sampleCoverInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    state.pendingSampleImage = await readCompressedFile(file);
  } catch {
    state.pendingSampleImage = null;
    event.target.value = "";
    alert(`样本封面上传失败：${file.name}。请确认是 PNG/JPG/WebP/SVG 图片。`);
  }
});

$("#addSampleBtn").addEventListener("click", async () => {
  const ctr = Number($("#sampleCtrInput").value);
  const inputs = getSampleInputs();
  if (!state.pendingSampleImage) return alert("请先上传一张样本封面。");
  if (!Number.isFinite(ctr) || ctr <= 0) return alert("请填写真实点击率。");
  if (!inputs.title) return alert("请填写样本标题。");

  await addTrainingSample({
    name: inputs.title,
    project: inputs.project,
    ctr,
    image: state.pendingSampleImage,
    inputs,
  });

  state.pendingSampleImage = null;
  $("#sampleCoverInput").value = "";
});

function clearSamples() {
  if (!confirm("确定清空当前本地样本库吗？")) return;
  state.library = [];
  saveLibrary();
  recalculateAll();
}

$("#loadProjectSamplesBtn").addEventListener("click", loadProjectSamples);
$("#clearSamplesBtn")?.addEventListener("click", clearSamples);
$("#adminClearSamplesBtn")?.addEventListener("click", clearSamples);
$("#triggerLearningBtn").addEventListener("click", runLearningAnalysis);
$("#publishTestBtn").addEventListener("click", publishTest);
$("#clearTestsBtn").addEventListener("click", async () => {
  if (!confirm("确定清空所有内测记录吗？")) return;
  try {
    await apiRequest("/api/tests", { method: "DELETE" });
  } catch {
    // File mode and static-only mode clear local records only.
  }
  state.tests = [];
  state.selectedTestId = null;
  saveTests();
  render();
});

$("#sampleTableInput").addEventListener("change", (event) => {
  state.pendingImportFile = event.target.files[0] || null;
  $("#tableImportStatus").textContent = state.pendingImportFile ? `已选择：${state.pendingImportFile.name}` : "字段：filename 或 cover_url、ctr、title、project。";
});

$("#importTableBtn").addEventListener("click", async () => {
  const file = state.pendingImportFile;
  if (!file) return alert("请先上传样本表格。");
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    $("#tableImportStatus").textContent = "当前前端 MVP 不能直接解析 XLSX 嵌入截图。正式后端会抽取图片并入库；现在请用 CSV/TSV。";
    return;
  }

  try {
    $("#tableImportStatus").textContent = "正在导入样本...";
    const delimiter = name.endsWith(".tsv") ? "\t" : ",";
    const result = await importDelimitedText(await file.text(), delimiter);
    $("#tableImportStatus").textContent = `导入完成：新增/更新 ${result.imported} 条，跳过 ${result.skipped} 条。`;
  } catch {
    $("#tableImportStatus").textContent = "导入失败：请检查字段名、图片路径和点击率。";
  }
});

$("#optimizeTopBtn").addEventListener("click", () => {
  const best = rankedCovers()[0];
  if (!best) return;
  state.optimizationCoverId = best.id;
  renderOptimizationPanel();
});

$("#generateVariantsBtn").addEventListener("click", async () => {
  const cover = getCoverById(state.optimizationCoverId) || rankedCovers()[0];
  if (!cover) return;
  await generateOptimizedVariants(cover.id, 2);
});

coverGrid.addEventListener("click", (event) => {
  const optimizeButton = event.target.closest(".optimize-cover-btn");
  const selectButton = event.target.closest(".select-test-btn");
  const generateButton = event.target.closest(".generate-cover-btn");

  if (optimizeButton) {
    state.optimizationCoverId = optimizeButton.dataset.coverId;
    renderOptimizationPanel();
    return;
  }

  if (selectButton) {
    const coverId = selectButton.dataset.coverId;
    if (state.selectedCoverIds.has(coverId)) {
      state.selectedCoverIds.delete(coverId);
    } else {
      state.selectedCoverIds.add(coverId);
    }
    saveCandidateState();
    render();
    return;
  }

  if (generateButton) {
    generateOptimizedVariants(generateButton.dataset.coverId, 1);
  }
});

$("#testList").addEventListener("click", async (event) => {
  const viewButton = event.target.closest(".view-results-btn");
  const openButton = event.target.closest(".open-test-btn");
  const copyButton = event.target.closest(".copy-test-btn");
  if (viewButton) {
    state.selectedTestId = viewButton.dataset.testId;
    renderTestDashboard();
    return;
  }
  if (openButton) {
    state.selectedTestId = openButton.dataset.testId;
    history.pushState({}, "", makeTestUrl(openButton.dataset.testId));
    showPublicTestFromHash();
    return;
  }
  if (copyButton) {
    try {
      await navigator.clipboard.writeText(copyButton.dataset.url);
      copyButton.textContent = "已复制";
    } catch {
      prompt("复制这个内测链接：", copyButton.dataset.url);
    }
  }
});

$("#publicFeed").addEventListener("click", (event) => {
  const card = event.target.closest(".rednote-card");
  if (!card) return;
  recordPublicClick(card.dataset.testId, card.dataset.coverId);
});

$("#backToAppBtn").addEventListener("click", () => {
  if (location.protocol === "file:") {
    location.hash = "";
  } else {
    history.pushState({}, "", "/app/");
  }
  showPublicTestFromHash();
  render();
});

$("#closeClickModal").addEventListener("click", () => {
  $("#clickModal").classList.add("hidden");
});

window.addEventListener("hashchange", showPublicTestFromHash);
window.addEventListener("popstate", showPublicTestFromHash);

function handleSampleDelete(event) {
  const button = event.target.closest(".delete-sample-btn");
  if (!button) return;
  state.library = state.library.filter((sample) => sample.id !== button.dataset.sampleId);
  saveLibrary();
  recalculateAll();
}

$("#libraryList")?.addEventListener("click", handleSampleDelete);
$("#adminLibraryList")?.addEventListener("click", handleSampleDelete);

function clearCandidateCovers(options = {}) {
  const ask = options.ask ?? true;
  if (!state.covers.length) {
    renderUploadNote();
    return;
  }
  if (ask && !confirm("确定清空当前候选封面吗？")) return;
  state.covers = [];
  state.optimizationCoverId = null;
  state.selectedCoverIds.clear();
  sessionStorage.removeItem(CANDIDATE_STORAGE_KEY);
  $("#coverInput").value = "";
  render();
}

$("#resetBtn").addEventListener("click", () => clearCandidateCovers());
$("#clearCoversBtn").addEventListener("click", () => clearCandidateCovers());

document.querySelectorAll(".segmented button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segmented button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.sort = button.dataset.sort;
    renderCovers();
  });
});

["titleInput", "audienceInput", "hasFaceInput", "hasBeforeAfterInput"].forEach((id) => {
  $(`#${id}`).addEventListener("input", recalculateAll);
  $(`#${id}`).addEventListener("change", recalculateAll);
});

render();
showPublicTestFromHash();
refreshTestsFromApi();
