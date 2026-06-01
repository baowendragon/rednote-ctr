#!/usr/bin/env python3
import json
import mimetypes
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "rednote_ctr.db"
PORT = int(os.environ.get("PORT", "8000"))


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.executescript(
            """
            create table if not exists test_sessions (
              id text primary key,
              title text not null,
              description text not null,
              created_at text not null
            );

            create table if not exists test_items (
              id text primary key,
              session_id text not null,
              name text not null,
              image text not null,
              predicted_ctr real default 0,
              views integer default 0,
              clicks integer default 0,
              created_at text not null,
              foreign key(session_id) references test_sessions(id) on delete cascade
            );
            """
        )


def session_payload(conn, session_id):
    session = conn.execute("select * from test_sessions where id = ?", (session_id,)).fetchone()
    if not session:
        return None
    items = conn.execute(
        "select * from test_items where session_id = ? order by created_at asc",
        (session_id,),
    ).fetchall()
    return {
        "id": session["id"],
        "title": session["title"],
        "description": session["description"],
        "createdAt": session["created_at"],
        "covers": [
            {
                "id": item["id"],
                "name": item["name"],
                "image": item["image"],
                "predictedCtr": item["predicted_ctr"],
                "views": item["views"],
                "clicks": item["clicks"],
            }
            for item in items
        ],
    }


class Handler(SimpleHTTPRequestHandler):
    server_version = "RedNoteCTR/0.1"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/tests":
            return self.api_list_tests()
        if path.startswith("/api/tests/"):
            return self.api_get_test(path.split("/")[-1])
        return self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/tests":
            return self.api_create_test()
        if path.startswith("/api/tests/") and path.endswith("/view"):
            return self.api_record_view(path.split("/")[-2])
        if path.startswith("/api/tests/") and path.endswith("/click"):
            return self.api_record_click(path.split("/")[-2])
        return self.json_response({"error": "Not found"}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == "/api/tests":
            with db() as conn:
                conn.execute("delete from test_items")
                conn.execute("delete from test_sessions")
            return self.json_response({"ok": True})
        return self.json_response({"error": "Not found"}, 404)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def json_response(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def api_list_tests(self):
        with db() as conn:
            sessions = conn.execute("select id from test_sessions order by created_at desc").fetchall()
            tests = [session_payload(conn, row["id"]) for row in sessions]
        return self.json_response({"tests": tests})

    def api_get_test(self, session_id):
        with db() as conn:
            payload = session_payload(conn, session_id)
        if not payload:
            return self.json_response({"error": "Not found"}, 404)
        return self.json_response(payload)

    def api_create_test(self):
        payload = self.read_json()
        covers = payload.get("covers") or []
        if len(covers) < 2:
            return self.json_response({"error": "At least 2 covers are required"}, 400)

        session_id = uuid.uuid4().hex[:12]
        created_at = now_iso()
        with db() as conn:
            conn.execute(
                "insert into test_sessions (id, title, description, created_at) values (?, ?, ?, ?)",
                (
                    session_id,
                    str(payload.get("title") or "封面内测")[:80],
                    str(payload.get("description") or "点击你最想打开的一张封面")[:120],
                    created_at,
                ),
            )
            for cover in covers[:20]:
                conn.execute(
                    """
                    insert into test_items
                    (id, session_id, name, image, predicted_ctr, views, clicks, created_at)
                    values (?, ?, ?, ?, ?, 0, 0, ?)
                    """,
                    (
                        uuid.uuid4().hex[:12],
                        session_id,
                        str(cover.get("name") or "候选封面")[:120],
                        cover.get("image") or "",
                        float(cover.get("predictedCtr") or 0),
                        now_iso(),
                    ),
                )
            result = session_payload(conn, session_id)
        return self.json_response(result, 201)

    def api_record_view(self, session_id):
        with db() as conn:
            payload = session_payload(conn, session_id)
            if not payload:
                return self.json_response({"error": "Not found"}, 404)
            conn.execute("update test_items set views = views + 1 where session_id = ?", (session_id,))
            payload = session_payload(conn, session_id)
        return self.json_response(payload)

    def api_record_click(self, session_id):
        payload = self.read_json()
        item_id = payload.get("coverId")
        with db() as conn:
            exists = conn.execute(
                "select id from test_items where id = ? and session_id = ?",
                (item_id, session_id),
            ).fetchone()
            if not exists:
                return self.json_response({"error": "Not found"}, 404)
            conn.execute("update test_items set clicks = clicks + 1 where id = ?", (item_id,))
            result = session_payload(conn, session_id)
        return self.json_response(result)

    def serve_static(self, path):
        if path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", "/app/")
            self.end_headers()
            return
        elif path in ("/app", "/app/"):
            path = "/app/index.html"
        elif path.startswith("/test/") and Path(path).name in {"styles.css", "trained-model.js", "app.js"}:
            path = f"/app/{Path(path).name}"
        elif path.startswith("/test/"):
            path = "/app/index.html"
        decoded = unquote(path).lstrip("/")
        target = (ROOT / decoded).resolve()
        if target.is_dir():
            target = target / "index.html"
        if not str(target).startswith(str(ROOT)) or not target.exists() or target.is_dir():
            self.send_error(404)
            return
        content = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in {".html", ".css", ".js", ".csv", ".svg"}:
            mime = f"{mime}; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    init_db()
    print(f"RedNote CTR running at http://127.0.0.1:{PORT}/app/")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
