"""Import the bundled Java8gu Markdown snapshot into the local SQLite knowledge store."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from java8gu_content import (
    build_content_fields,
    has_markdown_residue,
    is_knowledge_supplement,
    markdown_from_plain_text,
)


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


def remove_stale_supplements(connection: sqlite3.Connection) -> None:
    connection.execute(
        "DELETE FROM java8_relation WHERE source_id LIKE 'yuque-live-%' OR target_id LIKE 'yuque-live-%'"
    )
    connection.execute("DELETE FROM java8_example WHERE node_id LIKE 'yuque-live-%'")
    connection.execute("DELETE FROM java8_interview WHERE node_id LIKE 'yuque-live-%'")
    connection.execute("DELETE FROM java8_node WHERE id LIKE 'yuque-live-%'")


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
        category_ids_by_label = {category["label"]: category["id"] for category in index["categories"]}
        for position, category in enumerate(index["categories"], start=1):
            upsert_node(
                connection,
                (
                    f"yuque-cat-{category['id']}", category["label"],
                    f"{category['count']} 个知识节点", "", "CATEGORY", 1, "java8gu", position, now, now,
                ),
            )

        imported = 0
        summary_residue = 0
        short_answer_residue = 0
        connection.execute("DELETE FROM java8_interview WHERE node_id LIKE 'yuque-node-%'")
        for position, question in enumerate(index["questions"], start=1):
            markdown_path = MARKDOWN_ROOT / f"{question['id']}.md"
            if not markdown_path.exists():
                continue
            markdown = markdown_path.read_text(encoding="utf-8")
            category_label = category_labels.get(question["categoryId"], question["categoryId"])
            fields = build_content_fields(markdown, question["title"], category_label)
            node_id = f"yuque-node-{question['id']}"
            node_type = "INTERVIEW" if question["categoryId"] in {"22_面经与项目分享", "23_软技能与面试准备"} else "CONCEPT"
            upsert_node(
                connection,
                (
                    node_id, question["title"], fields.summary, fields.content, node_type, 2,
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
                    node_id, question["title"], fields.short_answer,
                    fields.detail_answer, fields.project_answer, now, now,
                ),
            )
            summary_residue += int(has_markdown_residue(fields.summary))
            short_answer_residue += int(has_markdown_residue(fields.short_answer))
            imported += 1

        supplemented = 0
        skipped_supplements = 0
        remove_stale_supplements(connection)
        if YUQUE_SUPPLEMENT_PATH.exists():
            all_supplements = [
                json.loads(line) for line in YUQUE_SUPPLEMENT_PATH.read_text(encoding="utf-8").splitlines() if line.strip()
            ]
            supplements = [
                item for item in all_supplements
                if is_knowledge_supplement(item["title"], item["category"], item["content"])
            ]
            skipped_supplements = len(all_supplements) - len(supplements)
            category_aliases = {
                "AI&大模型": "AI与大模型",
                "其他专属内容": "软技能与面试准备",
                "面试必备": "软技能与面试准备",
                "面经实战": "面经与项目分享",
            }
            for position, item in enumerate(supplements, start=1):
                node_id = f"yuque-live-{item['slug']}"
                markdown = markdown_from_plain_text(item["title"], item["content"])
                category_label = category_aliases.get(item["category"], item["category"])
                category_id = category_ids_by_label.get(category_label, "23_软技能与面试准备")
                fields = build_content_fields(markdown, item["title"], category_label)
                upsert_node(
                    connection,
                    (
                        node_id, item["title"], fields.summary, fields.content, "CONCEPT", 2,
                        f"yuque-cat-{category_id}", 10000 + position, now, now,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO java8_interview
                    (node_id, question, short_answer, detail_answer, project_answer, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        node_id, item["title"], fields.short_answer, fields.detail_answer,
                        fields.project_answer, now, now,
                    ),
                )
                summary_residue += int(has_markdown_residue(fields.summary))
                short_answer_residue += int(has_markdown_residue(fields.short_answer))
                supplemented += 1
        connection.commit()
        print(json.dumps({
            "database": str(DATABASE_PATH), "categories": len(index["categories"]),
            "nodes": imported, "supplemented": supplemented, "skippedSupplements": skipped_supplements,
            "quality": {
                "summaryMarkdownResidue": summary_residue,
                "shortAnswerMarkdownResidue": short_answer_residue,
            },
        }, ensure_ascii=False))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
