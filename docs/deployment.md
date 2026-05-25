# 线上部署说明

当前 MVP 是一个轻量全栈应用：

- 前端：`app/`
- 后端：`backend/server.py`
- 数据库：`data/rednote_ctr.db`
- 图片与样本：`data/`

后端使用 Python 标准库和 SQLite，不需要额外 Python 依赖。

## 本地运行

```bash
cd /Users/jiangnan/Documents/rednote-ctr
python backend/server.py
```

打开：

```text
http://127.0.0.1:8000/app/
```

这个方式会启用 API，内测发布、曝光和点击会写入 `data/rednote_ctr.db`。

## Render 部署

项目已包含 `render.yaml` 和 `Procfile`。

推荐步骤：

1. 把项目推到 GitHub 仓库。
2. 打开 Render，选择 New Web Service。
3. 连接 GitHub 仓库。
4. Runtime 选择 Python。
5. Start Command 使用：

```bash
python backend/server.py
```

6. 部署完成后访问：

```text
https://你的域名/app/
```

## MVP 数据说明

当前 SQLite 文件默认写在：

```text
data/rednote_ctr.db
```

注意：Render 免费实例的本地磁盘可能不是长期持久存储。正式运营时建议升级为：

- Render PostgreSQL
- Supabase Postgres
- Neon Postgres
- Railway Postgres

## 线上测试流程

1. 管理员打开 `/app/`。
2. 上传候选封面或使用示例封面。
3. 选择至少 2 张封面加入内测。
4. 点击“发布封面内测”。
5. 复制生成的 `#test=...` 链接给测试用户。
6. 测试用户点击喜欢的封面。
7. 管理员在“内测结果”查看曝光、点击和 CTR。
