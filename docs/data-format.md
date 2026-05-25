# 离线样本数据格式

第一阶段 MVP 使用项目目录里的静态数据。日常运营建议维护 Excel 主表：

```text
data/rednote_ctr_sample_library.xlsx
```

图片素材单独放：

```text
data/
├── images/
│   ├── sample-01.svg
│   └── ...
├── rednote_ctr_sample_library.xlsx
└── samples.csv
```

当前前端仍读取 `samples.csv`。因此 Excel 是运营主表，`samples.csv` 是前端导入文件；后续可以增加同步脚本或后端导入能力，让系统直接读取 Excel。

`samples.csv` 最简字段：

```text
filename,ctr
001.jpg,8.6
002.jpg,11.2
```

推荐字段：

```text
filename,ctr,title,project,has_face,has_before_after
001.jpg,8.6,热玛吉术前避坑,热玛吉,是,否
002.jpg,11.2,抗衰前后真实反馈,抗衰,是,是
```

字段说明：

- `filename`：图片文件名，默认从 `data/images/` 读取。
- `ctr`：真实点击率百分比，例如 `8.6` 表示 8.6%。
- `title`：笔记标题或封面大字标题。
- `project`：医美细分项目。
- `has_face`：是否有人物主体，支持 `是/否`、`true/false`、`1/0`。
- `has_before_after`：是否包含真实前后对比或结果展示。

也兼容 `cover_url`、`cover_data_url`、`image` 字段。后续后端阶段再支持 `.xlsx` 嵌入图片抽取、OCR 和数据库入库。

## Excel 主表字段

`rednote_ctr_sample_library.xlsx` 的“样本录入”工作表包含这些字段：

- `filename`：必填，图片文件名。
- `ctr`：必填，真实点击率百分比。
- `title`：建议填写，笔记标题或封面大字标题。
- `project`：建议填写，医美项目。
- `has_face`：建议填写，是否有人物主体。
- `has_before_after`：建议填写，是否有前后对比或结果展示。
- `account_type`：可选，账号类型。
- `exposure`：强烈建议填写，曝光量。
- `clicks`：强烈建议填写，点击量。
- `published_at`：建议填写，发布时间。
- `note_url`：可选，笔记链接或内部链接。
- `source`：可选，样本来源。
- `designer`：可选，设计师或负责人。
- `status`：建议填写，数据状态。
- `notes`：可选，备注。
