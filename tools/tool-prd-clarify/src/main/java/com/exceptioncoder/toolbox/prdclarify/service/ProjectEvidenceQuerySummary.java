package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceQuery;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 为项目证据工具构造有界、可复现的检索文本。 */
final class ProjectEvidenceQuerySummary {

    static final int MAX_QUERY_CHARS = 2_400;
    private static final int MAX_DESCRIPTION_CHARS = 1_100;
    private static final int MAX_BUSINESS_CLUE_CHARS = 700;
    private static final int MAX_BUSINESS_CLUES = 12;
    private static final int MAX_ANCHORS = 30;
    private static final Pattern ATTACHMENT_BODY = Pattern.compile("(?s)\\R---\\s*\\R【附件[:：]");
    private static final Pattern ATTACHMENT_LINK = Pattern.compile("\\[[^]]*附件[^]]*]\\([^)]*\\)");
    private static final Pattern BUSINESS_CLUE = Pattern.compile(
            "用户|管理|查看|查询|展示|判断|需要|目标|范围|规则|状态|进度|里程碑|计划|审批|调拨|"
                    + "入库|出库|仓库|生产|订单|验收|权限|风险|依赖|异常|完成|取消|作废|审核");
    private static final Pattern TECHNICAL_ANCHOR = Pattern.compile(
            "https?://[^\\s)]+|/[A-Za-z0-9_./-]+\\.action(?:\\?[^\\s)]*)?"
                    + "|(?:[A-Za-z]:)?[/\\\\](?:[A-Za-z0-9_.-]+[/\\\\])+[A-Za-z0-9_.-]+"
                    + "|\\b[A-Z][A-Za-z0-9]*(?:Action|Controller|Service|Manager|Repository|Mapper)\\b"
                    + "|\\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+){1,6}\\b|`([^`\\r\\n]{2,160})`",
            Pattern.CASE_INSENSITIVE);

    private ProjectEvidenceQuerySummary() {
    }

    static String build(ProjectEvidenceQuery query) {
        String description = value(query.description());
        DescriptionParts parts = splitDescription(description);
        String summary = summarize(parts.userText());
        Set<String> businessClues = businessClues(parts.attachmentText());
        Set<String> anchors = technicalAnchors(ATTACHMENT_LINK.matcher(description).replaceAll(" "));
        StringBuilder result = new StringBuilder(MAX_QUERY_CHARS);
        append(result, "需求标题", query.title());
        append(result, "关联模块", query.module());
        append(result, "需求摘要", summary);
        if (!businessClues.isEmpty()) {
            append(result, "附件业务线索", String.join("；", businessClues));
        }
        if (!anchors.isEmpty()) {
            append(result, "技术坐标", String.join("、", anchors));
        }
        return bounded(result.toString().trim(), MAX_QUERY_CHARS);
    }

    private static DescriptionParts splitDescription(String description) {
        Matcher attachment = ATTACHMENT_BODY.matcher(description);
        if (!attachment.find()) {
            return new DescriptionParts(description, "");
        }
        return new DescriptionParts(
                description.substring(0, attachment.start()),
                description.substring(attachment.end()));
    }

    private static String summarize(String description) {
        String normalized = ATTACHMENT_LINK.matcher(description).replaceAll(" ")
                .replaceAll("(?m)^#{1,6}\\s*", "")
                .replaceAll("\\s+", " ")
                .trim();
        return bounded(normalized, MAX_DESCRIPTION_CHARS);
    }

    private static Set<String> businessClues(String attachmentText) {
        LinkedHashSet<String> clues = new LinkedHashSet<>();
        int totalChars = 0;
        for (String line : attachmentText.split("\\R")) {
            String normalized = line
                    .replaceFirst("^\\s*(?:#{1,6}\\s*|[-*+]\\s+|\\d+[.)]\\s*)", "")
                    .replaceAll("[`|]", " ")
                    .replaceAll("\\s+", " ")
                    .trim();
            if (normalized.length() < 4 || !containsChinese(normalized)
                    || !BUSINESS_CLUE.matcher(normalized).find()) {
                continue;
            }
            String clue = bounded(normalized, 140);
            if (totalChars + clue.length() > MAX_BUSINESS_CLUE_CHARS) {
                break;
            }
            if (clues.add(clue)) {
                totalChars += clue.length();
            }
            if (clues.size() >= MAX_BUSINESS_CLUES) {
                break;
            }
        }
        return clues;
    }

    private static Set<String> technicalAnchors(String description) {
        LinkedHashSet<String> anchors = new LinkedHashSet<>();
        Matcher matcher = TECHNICAL_ANCHOR.matcher(description);
        while (matcher.find() && anchors.size() < MAX_ANCHORS) {
            String anchor = matcher.group(1) == null ? matcher.group() : matcher.group(1);
            String normalized = anchor.replaceAll("\\s+", " ").trim();
            String canonical = normalized.toLowerCase(Locale.ROOT);
            boolean duplicate = anchors.stream()
                    .anyMatch(existing -> existing.toLowerCase(Locale.ROOT).equals(canonical));
            if (!normalized.isBlank() && !duplicate) {
                anchors.add(bounded(normalized, 180));
            }
        }
        return anchors;
    }

    private static boolean containsChinese(String value) {
        return value.codePoints().anyMatch(codePoint -> codePoint >= 0x4E00 && codePoint <= 0x9FFF);
    }

    private static void append(StringBuilder target, String label, String value) {
        String normalized = value(value).replaceAll("\\s+", " ").trim();
        if (!normalized.isBlank()) {
            if (!target.isEmpty()) {
                target.append('\n');
            }
            target.append(label).append('：').append(normalized);
        }
    }

    private static String bounded(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    private record DescriptionParts(String userText, String attachmentText) {
    }
}
