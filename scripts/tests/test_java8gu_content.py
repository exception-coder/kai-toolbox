from __future__ import annotations

import sys
import unittest
from pathlib import Path


SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from java8gu_content import (  # noqa: E402
    build_content_fields,
    has_markdown_residue,
    is_knowledge_supplement,
    markdown_from_plain_text,
)


class Java8guContentTest(unittest.TestCase):
    def test_tcc_summary_prefers_readable_prose_over_table(self) -> None:
        markdown = """# ✅什么是TCC，和2PC有什么区别？

> 题号：0130 ｜ 分类：09_分布式事务

## 速记

- TCC是Try-Confirm-Cancel的缩写，是基于业务补偿的分布式事务方案。

### TCC和2PC有什么区别？

- **最大的区别：TCC把业务拆成三个独立事务，而2PC仍是一个长事务。**
| **维度** | **XA 2PC** | **TCC** |
|---|---|---|
| **性能** | 低 | 高 |
"""

        fields = build_content_fields(markdown, "什么是TCC，和2PC有什么区别？", "分布式事务")

        self.assertTrue(fields.summary.startswith("TCC是"))
        self.assertIn("最大的区别", fields.short_answer)
        self.assertNotIn("题号", fields.detail_answer)
        self.assertFalse(has_markdown_residue(fields.summary))
        self.assertFalse(has_markdown_residue(fields.short_answer))
        self.assertIn("## 核心答案", fields.content)
        self.assertIn("\n\n| **维度**", fields.content)

    def test_table_only_content_has_readable_fallback(self) -> None:
        markdown = """# Java和C++的区别

## 速记

| 维度 | Java | C++ |
|---|---|---|
| 跨平台 | 平台无关 | 平台相关 |
| 内存管理 | 自动 | 手动 |
"""

        fields = build_content_fields(markdown, "Java和C++的区别", "Java基础")

        self.assertIn("跨平台", fields.summary)
        self.assertIn("Java：平台无关", fields.summary)
        self.assertNotIn("|", fields.summary)

    def test_code_fence_is_not_used_as_answer(self) -> None:
        markdown = """# 如何使用Stream？

## 速记

```java
items.stream().filter(Item::active).toList();
```

- Stream通过声明式流水线完成过滤、映射和聚合。
"""

        fields = build_content_fields(markdown, "如何使用Stream？", "Stream")

        self.assertEqual("Stream通过声明式流水线完成过滤、映射和聚合。", fields.summary)

    def test_leading_labels_are_combined_into_a_useful_summary(self) -> None:
        markdown = """# Seata的4种事务模式

## 速记

- AT模式
- TCC模式
- Saga模式
- XA模式
- Saga适合包含外部接口的长事务，XA适合强一致性场景。
"""

        fields = build_content_fields(markdown, "Seata的4种事务模式", "分布式事务")

        self.assertEqual(
            "AT模式、TCC模式、Saga模式、XA模式；Saga适合包含外部接口的长事务，XA适合强一致性场景。",
            fields.summary,
        )

    def test_single_section_label_is_not_used_as_summary(self) -> None:
        markdown = """# CompletableFuture并发编排

## 速记

- 技术选型
- CompletableFuture支持异步任务组合，可以减少多个独立调用的总等待时间。
"""

        fields = build_content_fields(markdown, "CompletableFuture并发编排", "并发编程")

        self.assertTrue(fields.summary.startswith("CompletableFuture支持"))

    def test_non_knowledge_supplements_are_rejected(self) -> None:
        self.assertFalse(is_knowledge_supplement("更新Timeline_202601", "必读", "更新记录" * 300))
        self.assertFalse(is_knowledge_supplement("简历模板——5年", "面试必备", "模板" * 300))
        self.assertTrue(is_knowledge_supplement("RAG为什么要做混合检索？", "AI&大模型", "混合检索结合关键词和向量检索。\n\n它可以提升召回率和准确性。" * 20))

    def test_plain_text_supplement_is_structured(self) -> None:
        markdown = markdown_from_plain_text("什么是Loop Engineering", "Loop Engineering\n\n它通过反馈闭环持续改进系统。")

        self.assertTrue(markdown.startswith("# 什么是Loop Engineering"))
        self.assertIn("## 核心答案", markdown)
        self.assertNotIn("\r", markdown)

    def test_title_only_document_is_marked_as_incomplete(self) -> None:
        fields = build_content_fields("# 只有标题\n\n## 速记\n", "只有标题", "Java基础")

        self.assertIn("暂无可核验", fields.summary)
        self.assertIn("暂无可核验", fields.content)

    def test_adjacent_tables_are_separated(self) -> None:
        markdown = """# 两张表

## 速记

| 字段 | 类型 |
|---|---|
| id | bigint |
| 配置 | 值 |
|---|---|
| timeout | 30 |
"""

        fields = build_content_fields(markdown, "两张表", "数据库")

        self.assertIn("| id | bigint |\n\n| 配置 | 值 |", fields.content)


if __name__ == "__main__":
    unittest.main()
