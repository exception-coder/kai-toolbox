package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightType;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** 编排模型调用、输出校验、指纹生成和洞察持久化。 */
@Slf4j
@Service
public class ReqInsightApplicationService {

    private static final String ITEM_PROMPT_VERSION = "req-item-v1";
    private static final String PORTFOLIO_PROMPT_VERSION = "req-portfolio-v1";
    private static final String ENGINE = AgentOneShotRunner.DEFAULT_ENGINE;
    private static final String ITEM_SYSTEM_PROMPT = """
            你是一名资深产品顾问，专注于从业务视角评估功能需求的商业价值与开发优先级。

            严格输出 JSON，不加任何说明、前言或代码块围栏，直接以 { 开头。

            字段规范：
            - priority: "STRATEGIC" | "HIGH" | "MEDIUM" | "LOW"
            - stars: 整数 1-5
            - recommendation: 一句话中文建议，最多 20 字
            - reason: 聚焦业务价值的中文理由，最多 40 字
            - impacts: 受影响系统、模块或用户群的字符串数组
            - roi: "HIGH" | "MEDIUM" | "LOW"
            - estimatedHours: 非负整数，包含前后端的粗估开发工时

            评估业务价值、战略重要性、实现复杂度和 ROI。
            """;
    private static final String PORTFOLIO_SYSTEM_PROMPT = """
            你是一名资深产品总监，请从整体战略视角横向对比一批需求。

            严格输出 JSON，不加说明或代码块围栏。根对象包含 portfolioSummary 和 items。
            items 的每一项必须原样返回输入 ID，并包含：
            rank、priority、stars、recommendation、reason、impacts、roi、estimatedHours、comparedTo。

            priority 仅允许 "STRATEGIC"、"HIGH"、"MEDIUM"、"LOW"；
            roi 仅允许 "HIGH"、"MEDIUM"、"LOW"；rank 必须从 1 连续排列且不可重复。
            必须返回全部输入需求，不得新增、遗漏或重复 ID。

            排序依次考虑业务影响面、战略重要性、ROI、实现风险和依赖关系。
            """;

    private final AgentOneShotRunner agentRunner;
    private final ReqInsightValidator validator;
    private final ReqInsightFingerprint fingerprint;
    private final ReqInsightPersistenceService persistenceService;

    public ReqInsightApplicationService(
            AgentOneShotRunner agentRunner,
            ReqInsightValidator validator,
            ReqInsightFingerprint fingerprint,
            ReqInsightPersistenceService persistenceService
    ) {
        this.agentRunner = agentRunner;
        this.validator = validator;
        this.fingerprint = fingerprint;
        this.persistenceService = persistenceService;
    }

    public String analyzeItem(ReqItem item) {
        try {
            String raw = agentRunner.runOnce(ITEM_SYSTEM_PROMPT, buildItemPrompt(item), null, ENGINE);
            String payload = validator.validateItem(stripFence(raw));
            long createdAt = System.currentTimeMillis();
            persistenceService.saveAll(List.of(new ReqInsight(
                    UUID.randomUUID().toString(), item.getId(), ReqInsightType.ITEM,
                    ITEM_PROMPT_VERSION, fingerprint.sourceHash(item), null, payload,
                    ENGINE, null, createdAt)));
            return payload;
        } catch (RuntimeException exception) {
            log.warn("[reqpool-analysis] 单条洞察失败 itemId={}", item.getId(), exception);
            throw new IllegalStateException("AI 分析失败: " + exception.getMessage(), exception);
        }
    }

    public String analyzePortfolio(List<ReqItem> items) {
        if (items.isEmpty()) {
            return "暂无需求";
        }
        Set<String> expectedIds = new HashSet<>();
        for (ReqItem item : items) {
            if (!expectedIds.add(item.getId())) {
                throw new IllegalArgumentException("组合分析输入包含重复 ID: " + item.getId());
            }
        }

        try {
            String raw = agentRunner.runOnce(
                    PORTFOLIO_SYSTEM_PROMPT, buildPortfolioPrompt(items), null, ENGINE);
            ReqInsightValidator.ValidatedPortfolio validated = validator.validatePortfolio(
                    stripFence(raw), expectedIds);
            String portfolioHash = fingerprint.portfolioSetHash(items);
            long createdAt = System.currentTimeMillis();
            List<ReqInsight> histories = new ArrayList<>(items.size());
            for (ReqItem item : items) {
                histories.add(new ReqInsight(
                        UUID.randomUUID().toString(), item.getId(), ReqInsightType.PORTFOLIO,
                        PORTFOLIO_PROMPT_VERSION, fingerprint.sourceHash(item), portfolioHash,
                        validated.payloadById().get(item.getId()), ENGINE, null, createdAt));
            }
            persistenceService.saveAll(histories);
            log.info("[reqpool-portfolio] 分析完成 count={}", items.size());
            return validated.summary();
        } catch (RuntimeException exception) {
            log.warn("[reqpool-portfolio] 组合洞察失败 count={}", items.size(), exception);
            throw new IllegalStateException("Portfolio 分析失败: " + exception.getMessage(), exception);
        }
    }

    private static String buildItemPrompt(ReqItem item) {
        StringBuilder prompt = new StringBuilder("需求标题：").append(item.getTitle()).append('\n');
        appendOptional(prompt, "项目", item.getProject());
        appendOptional(prompt, "模块", item.getModule());
        appendOptional(prompt, "需求描述", item.getDescription());
        return prompt.append("请输出需求价值分析 JSON。").toString();
    }

    private static String buildPortfolioPrompt(List<ReqItem> items) {
        StringBuilder prompt = new StringBuilder("待排序需求共 ")
                .append(items.size()).append(" 条：\n\n");
        for (int index = 0; index < items.size(); index++) {
            ReqItem item = items.get(index);
            prompt.append("需求 ").append(index + 1).append("，ID: ").append(item.getId()).append('\n');
            prompt.append("标题：").append(item.getTitle()).append('\n');
            appendOptional(prompt, "项目", item.getProject());
            appendOptional(prompt, "模块", item.getModule());
            appendOptional(prompt, "描述", truncate(item.getDescription(), 300));
            prompt.append('\n');
        }
        return prompt.append("请输出完整的相对优先级排序 JSON。").toString();
    }

    private static void appendOptional(StringBuilder prompt, String label, String value) {
        if (value != null && !value.isBlank()) {
            prompt.append(label).append('：').append(value.strip()).append('\n');
        }
    }

    private static String truncate(String value, int maximumLength) {
        if (value == null) {
            return null;
        }
        String normalized = value.strip();
        return normalized.length() <= maximumLength
                ? normalized
                : normalized.substring(0, maximumLength) + "…";
    }

    private static String stripFence(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.strip();
        if (!normalized.startsWith("```")) {
            return normalized;
        }
        int contentStart = normalized.indexOf('\n');
        int contentEnd = normalized.lastIndexOf("```");
        return contentStart > 0 && contentEnd > contentStart
                ? normalized.substring(contentStart + 1, contentEnd).strip()
                : normalized;
    }
}
