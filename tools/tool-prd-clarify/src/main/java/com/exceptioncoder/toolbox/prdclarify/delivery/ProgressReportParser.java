package com.exceptioncoder.toolbox.prdclarify.delivery;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 将 PRD 模块生成的固定大纲进度报告解析为结构化交付证据。
 */
@Component
public class ProgressReportParser {

    private static final String COMPLETED_HEADING = "## 已完成";
    private static final String PARTIAL_HEADING = "## 部分完成";
    private static final String MISSING_HEADING = "## 未完成";
    private static final String ALIGNMENT_HEADING = "## 文档与代码差异";

    /**
     * 解析一份 Markdown 进度报告。
     *
     * @param markdown 进度报告正文
     * @return 结构化报告；空正文返回空报告
     */
    public ParsedProgressReport parse(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return ParsedProgressReport.empty();
        }

        List<ProgressItem> completed = new ArrayList<>();
        List<ProgressItem> partial = new ArrayList<>();
        List<ProgressItem> missing = new ArrayList<>();
        List<AlignmentFinding> alignment = new ArrayList<>();
        Section section = Section.NONE;
        MutableProgressItem current = null;
        List<String> tableLines = new ArrayList<>();

        for (String rawLine : markdown.split("\\R")) {
            String line = rawLine.trim();
            Section nextSection = sectionOf(line);
            if (nextSection != Section.NONE) {
                if (current != null) {
                    addItem(section, current.toItem(), completed, partial, missing);
                    current = null;
                }
                section = nextSection;
                continue;
            }
            if (line.startsWith("## ")) {
                if (current != null) {
                    addItem(section, current.toItem(), completed, partial, missing);
                    current = null;
                }
                section = Section.NONE;
                continue;
            }
            if (section == Section.ALIGNMENT) {
                if (line.startsWith("|")) {
                    tableLines.add(line);
                }
                continue;
            }

            String itemTitle = checklistTitle(line, section);
            if (itemTitle != null) {
                if (current != null) {
                    addItem(section, current.toItem(), completed, partial, missing);
                }
                current = new MutableProgressItem(itemTitle);
            } else if (current != null) {
                current.addDetail(line);
            }
        }

        if (current != null) {
            addItem(section, current.toItem(), completed, partial, missing);
        }
        alignment.addAll(parseAlignmentTable(tableLines));
        return new ParsedProgressReport(
                List.copyOf(completed),
                List.copyOf(partial),
                List.copyOf(missing),
                List.copyOf(alignment));
    }

    private Section sectionOf(String line) {
        return switch (line) {
            case COMPLETED_HEADING -> Section.COMPLETED;
            case PARTIAL_HEADING -> Section.PARTIAL;
            case MISSING_HEADING -> Section.MISSING;
            case ALIGNMENT_HEADING -> Section.ALIGNMENT;
            default -> Section.NONE;
        };
    }

    private String checklistTitle(String line, Section section) {
        String marker = switch (section) {
            case COMPLETED -> "- [x]";
            case PARTIAL -> "- [~]";
            case MISSING -> "- [ ]";
            default -> null;
        };
        if (marker == null) {
            return null;
        }
        String normalized = section == Section.COMPLETED ? line.toLowerCase(Locale.ROOT) : line;
        return normalized.startsWith(marker)
                ? line.substring(marker.length()).trim()
                : null;
    }

    private void addItem(
            Section section,
            ProgressItem item,
            List<ProgressItem> completed,
            List<ProgressItem> partial,
            List<ProgressItem> missing) {
        switch (section) {
            case COMPLETED -> completed.add(item);
            case PARTIAL -> partial.add(item);
            case MISSING -> missing.add(item);
            default -> {
                // 非进度章节中的列表不属于交付证据。
            }
        }
    }

    private List<AlignmentFinding> parseAlignmentTable(List<String> lines) {
        if (lines.size() < 3) {
            return List.of();
        }
        List<String> headers = tableCells(lines.get(0));
        Map<String, Integer> indexes = new LinkedHashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            indexes.put(headers.get(i), i);
        }
        if (!indexes.containsKey("需求") || !indexes.containsKey("文档要求")
                || !indexes.containsKey("当前代码") || !indexes.containsKey("状态")) {
            return List.of();
        }

        List<AlignmentFinding> findings = new ArrayList<>();
        for (int i = 2; i < lines.size(); i++) {
            List<String> cells = tableCells(lines.get(i));
            if (cells.size() < headers.size()) {
                continue;
            }
            findings.add(new AlignmentFinding(
                    cells.get(indexes.get("需求")),
                    cells.get(indexes.get("文档要求")),
                    cells.get(indexes.get("当前代码")),
                    cells.get(indexes.get("状态"))));
        }
        return findings;
    }

    private List<String> tableCells(String line) {
        String content = line.substring(1);
        if (content.endsWith("|")) {
            content = content.substring(0, content.length() - 1);
        }
        return java.util.Arrays.stream(content.split("\\|", -1))
                .map(String::trim)
                .toList();
    }

    private enum Section {
        NONE,
        COMPLETED,
        PARTIAL,
        MISSING,
        ALIGNMENT
    }

    /**
     * 一份进度报告的结构化结果。
     *
     * @param completed 已完成功能点
     * @param partial 部分完成功能点
     * @param missing 未完成功能点
     * @param alignment 文档与代码差异
     */
    public record ParsedProgressReport(
            List<ProgressItem> completed,
            List<ProgressItem> partial,
            List<ProgressItem> missing,
            List<AlignmentFinding> alignment) {

        /** 返回不含任何功能点的空报告。 */
        public static ParsedProgressReport empty() {
            return new ParsedProgressReport(List.of(), List.of(), List.of(), List.of());
        }

        /** 返回报告中的功能点总数。 */
        public int total() {
            return completed.size() + partial.size() + missing.size();
        }
    }

    /**
     * 进度报告中的一个功能点及其证据。
     *
     * @param title 功能点标题
     * @param evidence 代码证据
     * @param implemented 已实现内容
     * @param missing 缺失内容
     * @param expected 开发文档要求
     * @param actual 当前代码现状
     */
    public record ProgressItem(
            String title,
            List<String> evidence,
            String implemented,
            String missing,
            String expected,
            String actual) {
    }

    /**
     * 文档与代码差异表中的一行。
     *
     * @param requirement 需求
     * @param expected 文档要求
     * @param actual 当前代码
     * @param status 状态原文
     */
    public record AlignmentFinding(String requirement, String expected, String actual, String status) {
    }

    private static final class MutableProgressItem {

        private final String title;
        private final List<String> evidence = new ArrayList<>();
        private String implemented = "";
        private String missing = "";
        private String expected = "";
        private String actual = "";

        private MutableProgressItem(String title) {
            this.title = title;
        }

        private void addDetail(String line) {
            if (!line.startsWith("- ")) {
                return;
            }
            String detail = line.substring(2).trim();
            if (detail.startsWith("证据：")) {
                evidence.add(detail.substring("证据：".length()).trim());
            } else if (detail.startsWith("已实现：")) {
                implemented = detail.substring("已实现：".length()).trim();
            } else if (detail.startsWith("缺失：")) {
                missing = detail.substring("缺失：".length()).trim();
            } else if (detail.startsWith("开发文档要求：")) {
                expected = detail.substring("开发文档要求：".length()).trim();
            } else if (detail.startsWith("当前代码：")) {
                actual = detail.substring("当前代码：".length()).trim();
            }
        }

        private ProgressItem toItem() {
            return new ProgressItem(title, List.copyOf(evidence), implemented, missing, expected, actual);
        }
    }
}
