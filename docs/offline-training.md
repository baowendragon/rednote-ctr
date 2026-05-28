# 离线训练流程

目标：把真实高 CTR 样本库的学习放在本地一次性完成，线上只加载训练产物并做轻量推理。推荐流程是离线调用一次视觉大模型提特征，再离线回归训练，最后把回归系数部署到线上。

## 运营流程

1. 更新 `data/samples.csv`
   - 必填：`filename`、`ctr`
   - 建议：`title`、`project`、`has_face`、`has_before_after`
   - 离线脚本会补充模型特征列：`brightness`、`saturation`、`contrast`、`warm`、`title_hook` 等

2. 推荐：离线调用一次大模型提取图片语义特征

这一步只在运营侧跑，不进入线上用户流程。胜算云如果是 OpenAI 兼容接口，把 `OPENAI_BASE_URL` 换成它提供的地址，把 `OPENAI_VISION_MODEL` 换成它支持的视觉模型名。

```bash
cd /Users/jiangnan/Documents/rednote-ctr
OPENAI_API_KEY="你的key" \
OPENAI_BASE_URL="胜算云OpenAI兼容地址" \
OPENAI_VISION_MODEL="视觉模型名" \
OPENAI_API_MODE="chat" \
node scripts/extract_ai_features.mjs
```

脚本会生成：

```text
data/samples_ai_features.csv
```

3. 备选：不用 API 的本地特征提取

如果暂时不跑大模型，可以用本地脚本计算亮度、饱和度、主体反差、暖色比例、构图清晰度、缩略图可读性等特征。

```bash
/Users/jiangnan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/extract_local_features.py
```

4. 本地运行回归训练脚本

使用大模型特征训练：

```bash
node scripts/train_ctr_model.mjs --input=data/samples_ai_features.csv
```

使用本地离线特征训练：

```bash
node scripts/train_ctr_model.mjs --input=data/samples_local_features.csv
```

如果只想用最基础的结构化字段，用：

```bash
node scripts/train_ctr_model.mjs
```

训练脚本会输出 ridge regression 系数、特征权重、高 CTR 样本原型和诊断指标，并生成：

```text
app/trained-model.js
```

5. 提交并部署

```bash
git add data/samples.csv data/samples_ai_features.csv data/samples_local_features.csv app/trained-model.js scripts/extract_ai_features.mjs scripts/extract_local_features.py scripts/train_ctr_model.mjs app/app.js app/index.html docs/offline-training.md
git commit -m "Add offline CTR training model"
git push
```

Render 自动部署完成后，线上页面会直接使用 `trained-model.js` 做预测。

## 当前 MVP 逻辑

- 离线阶段：读取样本 CSV；调用大模型或本地脚本生成文字密度、主体突出、医美信任信号、钩子强度、构图清晰度、缩略图可读性等特征；用这些特征和真实 CTR 做 ridge regression；再生成高点击样本原型、CTR 区间、特征权重和回归系数。
- 线上阶段：只分析用户上传封面的轻量特征，然后用已部署的回归系数做预测，并用相似样本作为辅助参考。
- 如果 CSV 没有大模型特征列，模型可以退回本地视觉特征；但推荐最终上线使用 `samples_ai_features.csv` 训练出来的模型。

## 为什么省 token

线上用户每次上传封面时不调用大模型。大模型只在运营侧离线跑一次，用来给历史样本提特征；回归系数和训练结果被固化成一个静态 JS 文件随网站部署。
