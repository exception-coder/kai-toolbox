"""Content normalization for the local Java8 knowledge base."""

from __future__ import annotations

import re
from dataclasses import dataclass


SUMMARY_LIMIT = 180
SHORT_ANSWER_LIMIT = 320
DETAIL_ANSWER_LIMIT = 1200
PROJECT_ANSWER_LIMIT = 420

_DECORATIVE_PREFIX = re.compile(r"^[\s\u2600-\u27bf\U0001f300-\U0001faff]+")
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_LIST_MARKER = re.compile(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)")
_HORIZONTAL_RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_TABLE_SEPARATOR_CELL = re.compile(r"^:?-{3,}:?$")
_METADATA = re.compile(r"^(?:题号|分类|来源|更新时间|更新内容)\s*[:：｜|]")
_MARKDOWN_RESIDUE = re.compile(r"(?:\|---|\*\*|__|```|^#{1,6}\s)", re.MULTILINE)
_SUPPLEMENT_DENY = re.compile(
    r"(?:Timeline|时间线|必读|优惠|To读者|交流群|我该看哪些|项目实战课|新增面试题|新增面经|简历模板|技术分享)",
    re.IGNORECASE,
)

_GENERIC_HEADINGS = {"速记", "核心答案", "答案", "回答", "典型回答", "核心要点"}
_LOW_INFORMATION = {
    "优点",
    "优点：",
    "缺点",
    "缺点：",
    "总结",
    "总结：",
    "注意",
    "注意：",
    "具体来说",
    "具体来说：",
}
_NOISE_TEXT = {
    "题目",
    "更新时间",
    "更新内容",
    "Java八股",
    "若有收获，就点个赞吧",
}
_PROJECT_KEYWORDS = (
    "项目中",
    "实际项目",
    "业务场景",
    "应用场景",
    "实践",
    "案例",
    "例如",
    "订单",
    "库存",
    "转账",
    "账户",
    "支付",
)


@dataclass(frozen=True)
class ContentFields:
    content: str
    summary: str
    short_answer: str
    detail_answer: str
    project_answer: str


@dataclass(frozen=True)
class ContentBlock:
    text: str
    heading: str
    position: int
    kind: str = "text"


def clean_title(title: str) -> str:
    cleaned = _DECORATIVE_PREFIX.sub("", title).strip()
    return cleaned or title.strip()


def normalize_markdown(markdown: str, title: str) -> str:
    text = (
        markdown.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\ufeff", "")
        .replace("\u200b", "")
        .replace("\u00a0", " ")
    )
    lines = [line.rstrip() for line in text.split("\n")]
    normalized_title = clean_title(title)

    first_content = next((index for index, line in enumerate(lines) if line.strip()), None)
    if first_content is None:
        lines = [f"# {normalized_title}"]
    else:
        heading_match = _HEADING.match(lines[first_content].strip())
        if heading_match and len(heading_match.group(1)) == 1:
            lines[first_content] = f"# {normalized_title}"
        else:
            lines[first_content:first_content] = [f"# {normalized_title}", ""]

    lines = ["## 核心答案" if line.strip() == "## 速记" else line for line in lines]
    lines = _add_table_spacing(lines)

    compact: list[str] = []
    blank_count = 0
    for line in lines:
        if line.strip():
            blank_count = 0
            compact.append(line)
        else:
            blank_count += 1
            if blank_count <= 2:
                compact.append("")
    return "\n".join(compact).strip() + "\n"


def build_content_fields(markdown: str, title: str, category: str) -> ContentFields:
    content = normalize_markdown(markdown, title)
    blocks = extract_content_blocks(content, title)
    text_blocks = [block for block in blocks if block.kind == "text"]
    candidates = text_blocks or blocks

    if not candidates:
        fallback = "当前本地语料仅包含题目或引用，暂无可核验的正文答案。"
        content = content.rstrip() + f"\n\n> {fallback}\n"
        return ContentFields(content, fallback, fallback, fallback, f"所属专题：{category}。暂无可核验的项目案例。")

    summary_text = _build_summary_text(candidates)
    relevant = _most_relevant_block(candidates, title)
    summary = smart_truncate(summary_text, SUMMARY_LIMIT)

    short_parts = [summary_text]
    if relevant and relevant.text not in summary_text:
        short_parts.append(relevant.text)
    short_answer = smart_truncate("\n".join(short_parts), SHORT_ANSWER_LIMIT, preserve_lines=True)

    selected = _select_detail_blocks(candidates, relevant)
    detail_answer = smart_truncate(
        "\n".join(f"- {block.text}" for block in selected),
        DETAIL_ANSWER_LIMIT,
        preserve_lines=True,
    )

    project_blocks = [
        block for block in candidates
        if any(keyword in block.text or keyword in block.heading for keyword in _PROJECT_KEYWORDS)
    ]
    if project_blocks:
        project_answer = smart_truncate(
            "\n".join(f"- {block.text}" for block in project_blocks[:2]),
            PROJECT_ANSWER_LIMIT,
            preserve_lines=True,
        )
    else:
        project_answer = f"所属专题：{category}。当前语料未提供可核验的项目案例。"

    return ContentFields(content, summary, short_answer, detail_answer, project_answer)


def extract_content_blocks(markdown: str, title: str) -> list[ContentBlock]:
    lines = markdown.splitlines()
    blocks: list[ContentBlock] = []
    heading = ""
    in_fence = False
    index = 0
    position = 0

    while index < len(lines):
        stripped = lines[index].strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            index += 1
            continue
        if in_fence or not stripped:
            index += 1
            continue

        heading_match = _HEADING.match(stripped)
        if heading_match:
            heading = clean_inline_markdown(heading_match.group(2))
            index += 1
            continue

        if _is_table_header(lines, index):
            table_blocks, next_index = _table_blocks(lines, index, heading, position)
            blocks.extend(table_blocks)
            position += len(table_blocks)
            index = next_index
            continue

        text = stripped
        if text.startswith(">"):
            text = text[1:].strip()
        text = _LIST_MARKER.sub("", text)
        cleaned = clean_inline_markdown(text)
        if _is_meaningful(cleaned, title, heading):
            blocks.append(ContentBlock(cleaned, heading, position))
            position += 1
        index += 1

    return _deduplicate_blocks(blocks)


def clean_inline_markdown(text: str) -> str:
    cleaned = re.sub(r"!\[([^\]]*)]\([^)]*\)", r"\1", text)
    cleaned = re.sub(r"\[([^\]]+)]\([^)]*\)", r"\1", cleaned)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"`([^`]*)`", r"\1", cleaned)
    cleaned = re.sub(r"(?:\*\*|__|~~)", "", cleaned)
    cleaned = re.sub(r"(?<!\w)[*_](?!\w)|(?<=\W)[*_](?=\w)|(?<=\w)[*_](?=\W)", "", cleaned)
    cleaned = cleaned.replace("\\|", "|")
    cleaned = re.sub(r"\s*\|\s*", "；", cleaned)
    cleaned = re.sub(r"(?:；\s*){2,}", "；", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ；")
    return _DECORATIVE_PREFIX.sub("", cleaned).strip()


def smart_truncate(text: str, limit: int, preserve_lines: bool = False) -> str:
    if preserve_lines:
        normalized = "\n".join(re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip())
    else:
        normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= limit:
        return normalized

    window = normalized[: limit + 1]
    boundary = max(window.rfind(mark) for mark in ("。", "！", "？", "；", "\n"))
    if boundary >= limit // 2:
        return window[: boundary + 1].rstrip()
    return normalized[: limit - 1].rstrip("，,、；;：: ") + "…"


def is_knowledge_supplement(title: str, category: str, content: str) -> bool:
    normalized_title = clean_title(title)
    if _SUPPLEMENT_DENY.search(normalized_title) or _SUPPLEMENT_DENY.search(category):
        return False
    if len(re.sub(r"\s+", "", content)) < 300:
        return False
    return len(extract_content_blocks(markdown_from_plain_text(normalized_title, content), normalized_title)) >= 2


def markdown_from_plain_text(title: str, content: str) -> str:
    normalized_title = clean_title(title)
    text = (
        content.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\ufeff", "")
        .replace("\u200b", "")
        .replace("\u00a0", " ")
    )
    lines = [line.strip() for line in text.splitlines()]
    kept: list[str] = []
    for line in lines:
        if not line or line in _NOISE_TEXT:
            kept.append("")
            continue
        if clean_title(line) == normalized_title and not kept:
            continue
        kept.append(line)

    body = "\n".join(kept).strip()
    if _HEADING.search(body):
        return normalize_markdown(body, normalized_title)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return normalize_markdown(
        f"# {normalized_title}\n\n> 来源：语雀本地补充\n\n## 核心答案\n\n{body}",
        normalized_title,
    )


def has_markdown_residue(text: str) -> bool:
    return bool(_MARKDOWN_RESIDUE.search(text))


def _add_table_spacing(lines: list[str]) -> list[str]:
    output: list[str] = []
    index = 0
    while index < len(lines):
        if _is_table_header(lines, index):
            if output and output[-1].strip():
                output.append("")
            while index < len(lines) and _is_table_row(lines[index]):
                output.append(lines[index].strip())
                index += 1
            if index < len(lines) and lines[index].strip():
                output.append("")
            continue
        output.append(lines[index])
        index += 1
    return output


def _is_table_header(lines: list[str], index: int) -> bool:
    return (
        index + 1 < len(lines)
        and _is_table_row(lines[index])
        and _is_table_separator(lines[index + 1])
    )


def _is_table_row(line: str) -> bool:
    stripped = line.strip()
    return stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 2


def _is_table_separator(line: str) -> bool:
    if not _is_table_row(line):
        return False
    cells = _split_table_row(line)
    return bool(cells) and all(_TABLE_SEPARATOR_CELL.fullmatch(cell.replace(" ", "")) for cell in cells)


def _split_table_row(line: str) -> list[str]:
    return [clean_inline_markdown(cell) for cell in line.strip().strip("|").split("|")]


def _table_blocks(
    lines: list[str],
    index: int,
    heading: str,
    position: int,
) -> tuple[list[ContentBlock], int]:
    headers = _split_table_row(lines[index])
    index += 2
    result: list[ContentBlock] = []
    while index < len(lines) and _is_table_row(lines[index]):
        cells = _split_table_row(lines[index])
        description = _describe_table_row(headers, cells)
        if description:
            result.append(ContentBlock(description, heading, position + len(result), "table"))
        index += 1
    return result, index


def _describe_table_row(headers: list[str], cells: list[str]) -> str:
    if not any(cells):
        return ""
    label = cells[0] if cells else ""
    details: list[str] = []
    for column in range(1, min(len(headers), len(cells))):
        if not cells[column]:
            continue
        header = headers[column]
        details.append(f"{header}：{cells[column]}" if header else cells[column])
    if label and details:
        return f"{label}：{'；'.join(details)}"
    if details:
        return "；".join(details)
    return "；".join(cell for cell in cells if cell)


def _is_meaningful(text: str, title: str, heading: str) -> bool:
    if len(text) < 4 or text in _NOISE_TEXT or text in _LOW_INFORMATION:
        return False
    if clean_title(text).rstrip("？?。") == clean_title(title).rstrip("？?。"):
        return False
    if _METADATA.match(text) or _HORIZONTAL_RULE.match(text):
        return False
    if text in _GENERIC_HEADINGS or text == heading:
        return False
    if re.fullmatch(r"https?://\S+", text):
        return False
    return True


def _most_relevant_block(blocks: list[ContentBlock], title: str) -> ContentBlock | None:
    keywords = _title_keywords(title)
    if not keywords:
        return None
    scored: list[tuple[int, int, ContentBlock]] = []
    for block in blocks:
        haystack = f"{block.heading} {block.text}".casefold()
        score = sum(2 if keyword in block.heading.casefold() else 1 for keyword in keywords if keyword in haystack)
        if score:
            scored.append((score, -block.position, block))
    return max(scored, default=(0, 0, None))[2]


def _build_summary_text(blocks: list[ContentBlock]) -> str:
    """Build a useful answer from leading labels instead of exposing a lone fragment."""
    leading_fragments: list[str] = []
    for block in blocks:
        if _is_fragment(block.text):
            leading_fragments.append(block.text.rstrip("：:"))
            continue
        if len(leading_fragments) >= 2:
            return f"{'、'.join(leading_fragments[:6])}；{block.text}"
        return block.text
    return "、".join(leading_fragments[:8])


def _is_fragment(text: str) -> bool:
    return len(text) < 12 and not re.search(r"[。！？!?；;，,]", text)


def _title_keywords(title: str) -> list[str]:
    cleaned = clean_title(title).casefold()
    words = re.findall(r"[a-z][a-z0-9+.#_-]*|\d+[a-z]*", cleaned)
    chinese = re.sub(
        r"什么是|有哪些|有什么|区别|如何|怎么|为什么|是否|可以|能否|介绍一下|说说|和|与|的|了|吗|呢|[？?，,。！!：:（）()]",
        " ",
        cleaned,
    )
    words.extend(part for part in chinese.split() if len(part) >= 2)
    return list(dict.fromkeys(words))


def _select_detail_blocks(
    blocks: list[ContentBlock],
    relevant: ContentBlock | None,
) -> list[ContentBlock]:
    selected = list(blocks[:6])
    if relevant and relevant not in selected:
        selected.append(relevant)
    selected.sort(key=lambda block: block.position)
    return selected[:8]


def _deduplicate_blocks(blocks: list[ContentBlock]) -> list[ContentBlock]:
    seen: set[str] = set()
    result: list[ContentBlock] = []
    for block in blocks:
        key = re.sub(r"\s+", "", block.text).casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(block)
    return result
