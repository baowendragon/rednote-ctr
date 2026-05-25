# RedNote CTR

面向医美行业的小红书/RedNote 封面点击率预测工具。本阶段是本地静态 MVP：后台维护离线样本库，前台批量上传候选封面，系统基于历史样本相似度估算 CTR 并选出前三张。

## 项目结构

```text
rednote-ctr/
├── app/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/
│   ├── images/
│   ├── rednote_ctr_sample_library.xlsx
│   ├── sample_import_template.csv
│   └── samples.csv
├── docs/
│   ├── PROJECT_HANDOFF_rednote-ctr.md
│   └── data-format.md
└── index.html
```

## 本地运行

推荐启动带后端 API 的本地服务：

```bash
python backend/server.py
```

然后访问：

```text
http://127.0.0.1:8000/app/
```

也可以只启动静态服务：

```bash
python3 -m http.server 5173
```

然后访问：

```text
http://localhost:5173/app/
```

只启动静态服务时，内测数据会退回浏览器 localStorage；启动 `backend/server.py` 时，内测发布、曝光和点击会写入 SQLite。

## 当前能力

- 固定医美行业，不暴露行业切换。
- 前台最多上传 20 张候选封面。
- 基于样本库相似度加权预测 CTR。
- 输出预估 CTR 最高前三张封面。
- 为单张或前三封面生成 AI 图片微调 prompt。
- 支持本地一键生成轻量微调封面版本，用于模拟后续 Images API 改图能力。
- 支持选择多张封面发布内测，生成小红书样式双列信息流测试页。
- 支持记录内测曝光、点击和实测 CTR 排行。
- 后台可加载项目内 `data/samples.csv`。
- 后台可导入 CSV/TSV，字段可用 `filename`、`cover_url` 或 `cover_data_url`。
- 后台可单条录入样本并保存在浏览器 localStorage。

## 内测流程

1. 在前台上传候选封面，或点击“加入 12 张示例候选”。
2. 点击封面卡片里的“加入内测”，至少选择 2 张。
3. 点击左侧“发布封面内测”。
4. 页面会进入小红书样式双列信息流，用户点击某张封面后会记录点击。
5. 回到“内测结果”查看曝光、点击和实测 CTR 排行。

当前内测数据保存在浏览器 localStorage。真正给外部用户访问时，需要后端数据库和公开部署地址。

如果使用 `python backend/server.py` 或线上部署版本，内测数据会保存到 SQLite，多个用户访问同一个链接可以汇总点击数据。

## 线上部署

部署步骤见 [docs/deployment.md](./docs/deployment.md)。

C 端使用手册见 [docs/c-user-manual.md](./docs/c-user-manual.md)。

## 样本导入

日常运营建议把 [data/rednote_ctr_sample_library.xlsx](./data/rednote_ctr_sample_library.xlsx) 作为主表维护：

1. 把封面图片放进 `data/images/`。
2. 在 Excel 的“样本录入”工作表追加一行。
3. `filename` 填图片文件名，`ctr` 填真实点击率百分比。
4. 如果有曝光、点击、发布时间、账号类型，也一起补上。
5. 当前静态前端读取 `data/samples.csv`，所以 Excel 更新后先另存或同步一份 CSV。

最简 `data/samples.csv`：

```text
filename,ctr
001.jpg,8.6
002.jpg,11.2
```

推荐格式见 [docs/data-format.md](./docs/data-format.md)，可从 [data/sample_import_template.csv](./data/sample_import_template.csv) 复制模板。

## 后续路线

1. 增加后端 API：样本上传、候选预测、训练触发、样本列表。
2. 使用 SQLite/Postgres 保存样本和特征。
3. 后端解析 Excel，抽取 `.xlsx` 内嵌封面图和 CTR。
4. 接 OpenAI Images API，把“轻改图”从本地模拟升级为真实 AI 改图。
5. 接 OCR/视觉模型自动识别标题、人物主体、前后对比、项目词。
6. 样本足够后升级为传统模型或多模态 embedding + 回归模型。
