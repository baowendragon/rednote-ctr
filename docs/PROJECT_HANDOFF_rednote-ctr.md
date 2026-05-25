# rednote-ctr 项目交接文档

## 项目目标

做一个面向医美行业的小红书/RedNote 封面点击率预测工具。

核心思路不是靠固定规则估分，而是维护一个真实历史样本库：

1. 后台录入或导入优质封面样本。
2. 每条样本包含封面图和真实点击率，最好还有标题、医美项目、是否有人物主体、是否有前后对比等字段。
3. 系统对样本进行视觉/OCR/内容特征提取和打标。
4. 前台用户批量上传 10-20 张候选封面。
5. 系统基于历史样本相似度或训练模型预测点击率。
6. 输出预估点击率最高的前三张封面。
7. 对优质候选封面生成 AI 微调建议，后续可接图片编辑模型自动生成改图版本。

## 重要产品决策

- 只做医美行业，不需要行业选择栏。
- 前台只给普通用户使用，不暴露样本库维护。
- 后台由管理员维护优质样本库。
- 离线方案优先，不依赖小红书在线抓取。
- 样本数据优先使用“封面图 + 真实点击率”。
- 如果有标题、项目、发布时间、账号类型、曝光量、点击量，会让模型更准。
- 早期可以先用相似样本加权预测；样本量上来后再训练机器学习/多模态模型。

## 当前项目迁移状态

原型已迁入当前项目：

```text
/Users/jiangnan/Documents/rednote-ctr
```

正式结构：

```text
rednote-ctr/
├── app/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/
│   ├── images/
│   ├── rednote_ctr_sample_library.xlsx
│   ├── samples.csv
│   └── sample_import_template.csv
├── docs/
│   ├── data-format.md
│   └── PROJECT_HANDOFF_rednote-ctr.md
├── README.md
└── index.html
```

## 已实现能力

- 前台/后台模式切换
- 前台上传候选封面
- 最多 20 张候选封面
- 输出预估点击率前三
- 生成 AI 微调方案 prompt
- 后台单条样本录入
- 后台 CSV/TSV 样本表导入
- 后台加载项目内 `data/samples.csv`
- 后台手动触发学习分析打标
- 后台样本删除/清空
- 本地浏览器 localStorage 存储样本
- 基于样本库的相似度加权预测
- 运营用 Excel 主表：`data/rednote_ctr_sample_library.xlsx`

## 当前限制

- 当前仍是静态本地 MVP，没有真实后端。
- 样本存在浏览器 localStorage，不适合正式生产。
- 不能解析 `.xlsx` 内嵌封面截图。
- 当前前端不会直接读取 Excel 主表，Excel 更新后需要同步导出 `data/samples.csv`。
- 当前 CSV/TSV 导入需要字段 `filename`、`cover_url` 或 `cover_data_url`。
- 真实产品应由后端解析 Excel、抽取图片、OCR、视觉打标、模型训练。

## 离线数据结构

```text
data/
├── images/
│   ├── 001.jpg
│   ├── 002.jpg
│   └── 003.jpg
├── rednote_ctr_sample_library.xlsx
└── samples.csv
```

推荐 `samples.csv`：

```text
filename,ctr,title,project,has_face,has_before_after
001.jpg,8.6,热玛吉术前避坑,热玛吉,是,否
002.jpg,11.2,抗衰前后真实反馈,抗衰,是,是
003.jpg,7.9,水光新手功课,水光,是,否
```

## 后续开发建议

第一阶段：本地可用 MVP

- 后台支持上传图片文件夹 + CSV。
- 把样本库从 localStorage 改成 JSON 或 SQLite。
- 用本地图片路径和 CTR 建样本库。

第二阶段：真实后端

- 后端 API：样本上传、候选封面预测、训练触发、样本列表。
- 数据库：SQLite/Postgres。
- 图片存储：本地或对象存储。
- Excel 解析：支持 `.xlsx` 里嵌入图片和 CTR。
- OCR/视觉分析：自动识别标题文字、主体、人物、对比结构、医美项目词。

第三阶段：模型升级

- 样本少时：相似样本加权预测。
- 样本 200+：训练传统模型，例如 XGBoost/LightGBM。
- 样本 1000+：多模态 embedding + 回归模型。
- 后续接图像编辑模型，生成候选封面微调版本。
