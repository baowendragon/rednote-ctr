# 离线训练流程

目标：把真实高 CTR 样本库的学习放在本地一次性完成，线上只加载训练产物并做轻量推理，避免每个用户上传封面时都调用大模型。

## 运营流程

1. 更新 `data/samples.csv`
   - 必填：`filename`、`ctr`
   - 建议：`title`、`project`、`has_face`、`has_before_after`
   - 后续视觉模型或大模型提取的特征也可以写入列：`brightness`、`saturation`、`contrast`、`warm`、`title_hook`

2. 本地运行训练脚本

```bash
cd /Users/jiangnan/Documents/rednote-ctr
node scripts/train_ctr_model.mjs
```

3. 脚本会生成：

```text
app/trained-model.js
```

4. 提交并部署

```bash
git add data/samples.csv app/trained-model.js scripts/train_ctr_model.mjs app/app.js app/index.html docs/offline-training.md
git commit -m "Add offline CTR training model"
git push
```

Render 自动部署完成后，线上页面会直接使用 `trained-model.js` 做预测。

## 当前 MVP 逻辑

- 离线阶段：读取样本 CSV，生成高点击样本原型、CTR 区间、特征权重和高 CTR 画像。
- 线上阶段：只分析用户上传封面的轻量视觉特征，然后用离线模型做相似度加权预测。
- 如果 CSV 没有视觉特征列，模型会先基于标题钩子、人物主体、前后对比等结构化字段学习；等接入视觉/大模型特征后，只要把特征列写入 CSV，再重新训练即可。

## 为什么省 token

线上用户每次上传封面时不调用大模型。大模型或视觉模型只在运营侧离线跑，用来给历史样本提特征；训练结果被固化成一个静态 JS 文件随网站部署。
