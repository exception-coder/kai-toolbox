package com.exceptioncoder.toolbox.prdclarify.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 用确定性规则裁决 Agent 是否真正完成初始化规格。 */
@Component
public class PrdInitialSpecValidator {

    public static final String CRITERIA_VERSION = "initial-spec-quality-v2";
    private static final int MAX_OUTPUT_LENGTH = 100_000;
    private static final int MIN_MEANINGFUL_SECTION_LENGTH = 20;
    private static final List<String> REQUIRED_SECTIONS = List.of(
            "## 1. 探索摘要", "## 2. 目标与范围草案", "## 3. 现有行为、数据结构与约束",
            "## 4. 需求重构与推荐方案", "### 4.1 原始做法与真实目标", "### 4.2 复杂度审计",
            "### 4.3 候选方案", "### 4.4 推荐结论", "## 5. 需求与规则草案",
            "## 6. 场景与验收草案", "## 7. 证据账本", "## 8. 风险与冲突", "## 9. 开放问题");
    private static final List<String> REQUIRED_IDS =
            List.of("GOAL-", "OPT-", "REC-", "REQ-", "SCN-", "AC-", "EVD-");
    private static final Pattern OPEN_ID = Pattern.compile("\\bOPEN-\\d{3}\\b");

    public ValidationResult validate(String output) {
        List<String> gaps = new ArrayList<>();
        String content = output == null ? "" : output.trim();
        if (content.length() < 500) {
            gaps.add("正文少于 500 字，尚不足以形成可执行的初始化规格");
        }
        if (content.length() > MAX_OUTPUT_LENGTH) {
            gaps.add("正文超过 100000 字上限");
        }
        if (!content.startsWith("# ") || !content.contains("初始化规格")) {
            gaps.add("缺少“# 功能名称 · 初始化规格”标题");
        }
        for (String section : REQUIRED_SECTIONS) {
            if (!content.contains(section)) {
                gaps.add("缺少固定章节：" + section);
            }
        }
        for (String id : REQUIRED_IDS) {
            if (!content.contains(id)) {
                gaps.add("缺少稳定标识：" + id + "nnn");
            }
        }
        validateMeaningfulSection(content, "### 4.2 复杂度审计", "### 4.3 候选方案", gaps);
        validateMeaningfulSection(content, "### 4.3 候选方案", "### 4.4 推荐结论", gaps);
        validateMeaningfulSection(content, "### 4.4 推荐结论", "## 5. 需求与规则草案", gaps);
        Matcher matcher = OPEN_ID.matcher(content);
        java.util.Set<String> openIds = new java.util.LinkedHashSet<>();
        while (matcher.find()) {
            openIds.add(matcher.group());
        }
        if (openIds.size() > 5) {
            gaps.add("开放问题超过 5 个，必须继续用证据收敛");
        }
        return new ValidationResult(gaps.isEmpty(), List.copyOf(gaps));
    }

    private static void validateMeaningfulSection(
            String content,
            String section,
            String nextSection,
            List<String> gaps
    ) {
        int start = content.indexOf(section);
        int end = content.indexOf(nextSection);
        if (start < 0 || end <= start) {
            return;
        }
        String body = content.substring(start + section.length(), end)
                .replaceAll("\\s+", "")
                .trim();
        if (body.length() < MIN_MEANINGFUL_SECTION_LENGTH) {
            gaps.add("章节内容不足，无法形成可执行判断：" + section);
        }
    }

    public record ValidationResult(boolean complete, List<String> gaps) {
    }
}
