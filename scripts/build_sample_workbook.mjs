import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputPath = "/Users/jiangnan/Documents/rednote-ctr/data/rednote_ctr_sample_library.xlsx";

const workbook = Workbook.create();
const overview = workbook.worksheets.add("运营说明");
const samples = workbook.worksheets.add("样本录入");
const dictionary = workbook.worksheets.add("字段字典");
const options = workbook.worksheets.add("选项表");

overview.getRange("A1:H1").values = [["RedNote CTR 真实样本库"]];
overview.getRange("A3:B8").values = [
  ["使用方式", "把封面图片放进 data/images/，在“样本录入”里追加一行，并填写 filename 和真实 CTR。"],
  ["当前前端", "读取 data/samples.csv；Excel 更新后请同步导出 CSV，后续可接自动同步脚本。"],
  ["必填字段", "filename、ctr。建议同时填写 title、project、exposure、clicks、published_at。"],
  ["图片命名", "建议用 001.jpg、20260522_account_project_01.jpg 这类稳定文件名，不要频繁改名。"],
  ["CTR 口径", "ctr 填百分数数值，例如 8.6 表示 8.6%。如果有曝光和点击，也请填写。"],
  ["更新频率", "建议每周至少回填一次真实发布数据。"],
];

overview.getRange("D3:E8").values = [
  ["训练样本数", ""],
  ["平均 CTR", ""],
  ["最高 CTR", ""],
  ["已填曝光样本", ""],
  ["真人主体占比", ""],
  ["前后对比占比", ""],
];
overview.getRange("E3:E8").formulas = [
  ["=COUNT('样本录入'!B:B)"],
  ["=IFERROR(AVERAGE('样本录入'!B:B),\"\")"],
  ["=IFERROR(MAX('样本录入'!B:B),\"\")"],
  ["=COUNT('样本录入'!H:H)"],
  ["=IFERROR(COUNTIF('样本录入'!E:E,\"是\")/COUNT('样本录入'!B:B),\"\")"],
  ["=IFERROR(COUNTIF('样本录入'!F:F,\"是\")/COUNT('样本录入'!B:B),\"\")"],
];

const headers = [
  "filename",
  "ctr",
  "title",
  "project",
  "has_face",
  "has_before_after",
  "account_type",
  "exposure",
  "clicks",
  "published_at",
  "note_url",
  "source",
  "designer",
  "status",
  "notes",
];

const sampleRows = [
  ["sample-01.svg", 10.8, "热玛吉术前避坑清单", "热玛吉/抗衰", "是", "是", "机构号", 12000, 1296, new Date("2026-05-01"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
  ["sample-02.svg", 11.6, "抗衰前后真实反馈", "抗衰", "是", "是", "机构号", 18500, 2146, new Date("2026-05-03"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
  ["sample-03.svg", 8.9, "水光新手功课", "水光针", "是", "否", "达人号", 9600, 854, new Date("2026-05-05"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
  ["sample-04.svg", 9.4, "面诊必须问的问题", "面诊", "否", "否", "医生号", 7200, 677, new Date("2026-05-07"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
  ["sample-05.svg", 8.2, "光子嫩肤做前须知", "光子嫩肤", "是", "否", "机构号", 13800, 1132, new Date("2026-05-09"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
  ["sample-06.svg", 9.9, "祛斑项目别乱做", "祛斑", "是", "是", "机构号", 15400, 1525, new Date("2026-05-11"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
  ["sample-07.svg", 10.2, "法令纹改善真实变化", "抗衰/填充", "是", "是", "达人号", 11100, 1132, new Date("2026-05-13"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
  ["sample-08.svg", 7.6, "敏感肌能不能做医美", "敏感肌", "是", "否", "医生号", 8300, 631, new Date("2026-05-15"), "", "历史样本", "", "已入库", "示例数据，可替换为真实笔记"],
];

samples.getRange("A1:O1").values = [headers];
samples.getRange(`A2:O${sampleRows.length + 1}`).values = sampleRows;
samples.tables.add(`A1:O${sampleRows.length + 1}`, true).name = "SampleLibrary";

dictionary.getRange("A1:D1").values = [["字段", "是否必填", "说明", "示例"]];
dictionary.getRange("A2:D16").values = [
  ["filename", "必填", "封面图片文件名，图片放在 data/images/。", "001.jpg"],
  ["ctr", "必填", "真实点击率百分比，填 8.6 代表 8.6%。", "8.6"],
  ["title", "建议", "笔记标题或封面核心大字标题。", "热玛吉术前避坑清单"],
  ["project", "建议", "医美细分项目。", "热玛吉/抗衰"],
  ["has_face", "建议", "封面是否有人物主体。", "是"],
  ["has_before_after", "建议", "是否有真实前后对比或结果展示。", "否"],
  ["account_type", "可选", "账号类型，用于后续分组分析。", "机构号"],
  ["exposure", "强烈建议", "真实曝光量。", "12000"],
  ["clicks", "强烈建议", "真实点击量。", "1296"],
  ["published_at", "建议", "笔记发布时间。", "2026-05-01"],
  ["note_url", "可选", "笔记链接或内部素材链接。", "https://..."],
  ["source", "可选", "样本来源。", "历史样本"],
  ["designer", "可选", "设计师或负责人。", "小王"],
  ["status", "建议", "数据状态。", "已入库"],
  ["notes", "可选", "备注。", "投流样本/自然流量样本"],
];

options.getRange("A1:D1").values = [["是否选项", "账号类型", "状态", "常见项目"]];
options.getRange("A2:D12").values = [
  ["是", "机构号", "待补数据", "热玛吉/抗衰"],
  ["否", "医生号", "已入库", "水光针"],
  ["", "达人号", "排除", "光子嫩肤"],
  ["", "品牌号", "", "祛斑"],
  ["", "代运营", "", "面诊"],
  ["", "", "", "敏感肌"],
  ["", "", "", "法令纹"],
  ["", "", "", "瘦脸"],
  ["", "", "", "术后护理"],
  ["", "", "", "预算规划"],
  ["", "", "", "其他"],
];

for (const sheet of [overview, samples, dictionary, options]) {
  sheet.getRange("A1:O1").format.fill = "#1D2129";
  sheet.getRange("A1:O1").format.font = { color: "#FFFFFF", bold: true };
  sheet.getRange("A1:O1").format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
}

overview.getRange("A1:H1").format.font = { color: "#FFFFFF", bold: true, size: 18 };
overview.getRange("A1:H1").format.fill = "#E9415A";
overview.getRange("A3:B8").format.wrapText = true;
overview.getRange("D3:E8").format.fill = "#F5F7FA";
overview.getRange("D3:D8").format.font = { bold: true };
overview.getRange("E4:E5").format.numberFormat = "0.0";
overview.getRange("E7:E8").format.numberFormat = "0.0%";

samples.getRange("A:O").format.wrapText = true;
samples.getRange("B:B").format.numberFormat = "0.0";
samples.getRange("H:I").format.numberFormat = "#,##0";
samples.getRange("J:J").format.numberFormat = "yyyy-mm-dd";
samples.getRange("E2:E500").dataValidation = { allowBlank: true, list: { inCellDropDown: true, source: ["是", "否"] } };
samples.getRange("F2:F500").dataValidation = { allowBlank: true, list: { inCellDropDown: true, source: ["是", "否"] } };
samples.getRange("G2:G500").dataValidation = { allowBlank: true, list: { inCellDropDown: true, source: ["机构号", "医生号", "达人号", "品牌号", "代运营"] } };
samples.getRange("N2:N500").dataValidation = { allowBlank: true, list: { inCellDropDown: true, source: ["待补数据", "已入库", "排除"] } };
samples.getRange("B2:B500").conditionalFormats.add("colorScale", {
  criteria: [
    { type: "lowestValue", color: "#FCA5A5" },
    { type: "percentile", value: 50, color: "#FDE68A" },
    { type: "highestValue", color: "#86EFAC" },
  ],
});

const widths = {
  A: 150,
  B: 70,
  C: 210,
  D: 125,
  E: 90,
  F: 110,
  G: 95,
  H: 90,
  I: 80,
  J: 110,
  K: 220,
  L: 95,
  M: 85,
  N: 80,
  O: 240,
};
for (const [col, px] of Object.entries(widths)) {
  samples.getRange(`${col}:${col}`).format.columnWidthPx = px;
}
overview.getRange("A:A").format.columnWidthPx = 120;
overview.getRange("B:B").format.columnWidthPx = 520;
overview.getRange("D:D").format.columnWidthPx = 130;
overview.getRange("E:E").format.columnWidthPx = 110;
dictionary.getRange("A:A").format.columnWidthPx = 145;
dictionary.getRange("B:B").format.columnWidthPx = 95;
dictionary.getRange("C:C").format.columnWidthPx = 410;
dictionary.getRange("D:D").format.columnWidthPx = 210;
options.getRange("A:D").format.columnWidthPx = 120;

dictionary.tables.add("A1:D16", true).name = "FieldDictionary";
options.tables.add("A1:D12", true).name = "OptionsTable";

const scan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(scan.ndjson);

await workbook.render({ sheetName: "运营说明", range: "A1:E8", scale: 2 });
await workbook.render({ sheetName: "样本录入", range: "A1:O12", scale: 2 });
await workbook.render({ sheetName: "字段字典", range: "A1:D16", scale: 2 });
await workbook.render({ sheetName: "选项表", range: "A1:D12", scale: 2 });

await fs.mkdir("/Users/jiangnan/Documents/rednote-ctr/data", { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
