"""Import the bundled Java8gu Markdown snapshot into the local SQLite knowledge store."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = PROJECT_ROOT / "frontend" / "public" / "java8gu" / "index.json"
MARKDOWN_ROOT = PROJECT_ROOT / "frontend" / "public" / "java8gu" / "q"
YUQUE_SUPPLEMENT_PATH = PROJECT_ROOT / "tmp" / "java8gu-yuque" / "missing-docs.ndjson"
DATABASE_PATH = Path.home() / ".kai-toolbox" / "toolbox.db"


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS java8_node (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            node_type TEXT NOT NULL,
            level INTEGER NOT NULL DEFAULT 0,
            parent_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            create_time TEXT NOT NULL,
            update_time TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_java8_node_parent ON java8_node(parent_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_java8_node_type ON java8_node(node_type);
        CREATE TABLE IF NOT EXISTS java8_relation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            relation_type TEXT NOT NULL,
            create_time TEXT NOT NULL,
            update_time TEXT NOT NULL,
            UNIQUE(source_id, target_id, relation_type)
        );
        CREATE INDEX IF NOT EXISTS idx_java8_relation_source ON java8_relation(source_id);
        CREATE INDEX IF NOT EXISTS idx_java8_relation_target ON java8_relation(target_id);
        CREATE TABLE IF NOT EXISTS java8_example (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT NOT NULL,
            title TEXT NOT NULL,
            before_code TEXT NOT NULL DEFAULT '',
            after_code TEXT NOT NULL DEFAULT '',
            explanation TEXT NOT NULL DEFAULT '',
            create_time TEXT NOT NULL,
            update_time TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_java8_example_node ON java8_example(node_id);
        CREATE TABLE IF NOT EXISTS java8_interview (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT NOT NULL,
            question TEXT NOT NULL,
            short_answer TEXT NOT NULL DEFAULT '',
            detail_answer TEXT NOT NULL DEFAULT '',
            project_answer TEXT NOT NULL DEFAULT '',
            create_time TEXT NOT NULL,
            update_time TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_java8_interview_node ON java8_interview(node_id);
        """
    )


def upsert_node(connection: sqlite3.Connection, values: tuple[object, ...]) -> None:
    connection.execute(
        """
        INSERT INTO java8_node
        (id, title, summary, content, node_type, level, parent_id, sort_order, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          content = excluded.content,
          node_type = excluded.node_type,
          level = excluded.level,
          parent_id = excluded.parent_id,
          sort_order = excluded.sort_order,
          update_time = excluded.update_time
        """,
        values,
    )


def plain_summary(markdown: str, fallback: str) -> str:
    body = re.sub(r"```.*?```", " ", markdown, flags=re.DOTALL)
    body = re.sub(r"[#>*_`|\[\]()!-]", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    return (body or fallback)[:240]


def main() -> None:
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat()
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=30)
    try:
        create_schema(connection)
        upsert_node(
            connection,
            ("java8gu", "Java8 股", "Java 面试、遗留系统重构与工程实践知识库", "", "CATEGORY", 0, None, 0, now, now),
        )
        category_labels = {category["id"]: category["label"] for category in index["categories"]}
        for position, category in enumerate(index["categories"], start=1):
            upsert_node(
                connection,
                (
                    f"yuque-cat-{category['id']}", category["label"],
                    f"{category['count']} 个知识节点", "", "CATEGORY", 1, "java8gu", position, now, now,
                ),
            )

        imported = 0
        connection.execute("DELETE FROM java8_interview WHERE node_id LIKE 'yuque-node-%'")
        for position, question in enumerate(index["questions"], start=1):
            markdown_path = MARKDOWN_ROOT / f"{question['id']}.md"
            if not markdown_path.exists():
                continue
            markdown = markdown_path.read_text(encoding="utf-8")
            summary = question.get("tldr") or plain_summary(markdown, question["title"])
            node_id = f"yuque-node-{question['id']}"
            node_type = "INTERVIEW" if question["categoryId"] in {"22_面经与项目分享", "23_软技能与面试准备"} else "CONCEPT"
            upsert_node(
                connection,
                (
                    node_id, question["title"], summary[:500], markdown, node_type, 2,
                    f"yuque-cat-{question['categoryId']}", position, now, now,
                ),
            )
            connection.execute(
                """
                INSERT INTO java8_interview
                (node_id, question, short_answer, detail_answer, project_answer, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    node_id, question["title"], summary[:500],
                    plain_summary(markdown, question["title"])[:1500],
                    f"所属专题：{category_labels.get(question['categoryId'], question['categoryId'])}", now, now,
                ),
            )
            imported += 1

        supplemented = 0
        if YUQUE_SUPPLEMENT_PATH.exists():
            supplements = [
                json.loads(line) for line in YUQUE_SUPPLEMENT_PATH.read_text(encoding="utf-8").splitlines() if line.strip()
            ]
            supplement_categories = list(dict.fromkeys(item["category"] for item in supplements))
            for position, category in enumerate(supplement_categories, start=100):
                category_id = f"yuque-live-cat-{position}"
                upsert_node(
                    connection,
                    (category_id, category, "语雀目录差异补充", "", "CATEGORY", 1, "java8gu", position, now, now),
                )
            category_ids = {
                category: f"yuque-live-cat-{position}"
                for position, category in enumerate(supplement_categories, start=100)
            }
            connection.execute("DELETE FROM java8_interview WHERE node_id LIKE 'yuque-live-%'")
            for position, item in enumerate(supplements, start=1):
                node_id = f"yuque-live-{item['slug']}"
                summary = plain_summary(item["content"], item["title"])
                upsert_node(
                    connection,
                    (
                        node_id, item["title"], summary, item["content"], "CONCEPT", 2,
                        category_ids[item["category"]], position, now, now,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO java8_interview
                    (node_id, question, short_answer, detail_answer, project_answer, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (node_id, item["title"], summary, summary[:1500], f"来源：{item['href']}", now, now),
                )
                supplemented += 1
        connection.commit()
        print(json.dumps({
            "database": str(DATABASE_PATH), "categories": len(index["categories"]),
            "nodes": imported, "supplemented": supplemented,
        }, ensure_ascii=False))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
