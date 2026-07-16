package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * AI 需求洞察分析服务。
 *
 * <p>调用 Claude（通过 {@link AgentOneShotRunner}）对需求进行价值评估，
 * 输出结构化 JSON 存入 {@code req_pool_item.ai_insight}：
 * <ul>
 *   <li>priority  — STRATEGIC | HIGH | MEDIUM | LOW</li>
 *   <li>stars     — 1-5（价值星级）</li>
 *   <li>recommendation — 一句话 AI 建议（≤ 20字）</li>
 *   <li>reason    — 简短理由（≤ 40字）</li>
 *   <li>impacts   — 受影响的模块/系统列表</li>
 *   <li>roi       — HIGH | MEDIUM | LOW</li>
 *   <li>estimatedHours — 预计开发工时（粗估）</li>
 * </ul>
 */
@Slf4j
@Service
public class ReqAnalysisService {

    private static final String SYSTEM = """
            你是一名资深产品顾问，专注于从业务视角评估功能需求的商业价值与开发优先级。

            严格输出 JSON，不加任何说明、前言或代码块围栏，直接以 { 开头。

            字段规范：
            - priority: "STRATEGIC"（战略级，必做）| "HIGH"（高优先）| "MEDIUM"（可排期）| "LOW"（可延期）
            - stars: 整数 1-5（综合价值星级）
            - recommendation: 一句话建议，≤ 20 字，用中文
            - reason: 为什么这样建议，≤ 40 字，聚焦业务价值
            - impacts: 字符串数组，列出受影响的系统/模块/用户群（3-5 个，简短中文标签）
            - roi: "HIGH" | "MEDIUM" | "LOW"
            - estimatedHours: 整数，粗估开发工时（包含前后端，仅供参考）

            评估维度：
            1. 业务价值（覆盖用户面、解决痛点的迫切程度）
            2. 战略重要性（与核心业务的关联度）
            3. 实现复杂度（技术风险和工时）
            4. ROI（价值/成本比）
            """;

    private static final String PORTFOLIO_SYSTEM = """
            你是一名资深产品总监，专注于从整体战略视角对一批需求进行横向对比排序。

            你的任务：综合考虑所有需求的业务价值、战略重要性、ROI、实现难度，
            给出本期最优开发顺序——不是单独评估每条，而是它们之间的相对优先级。

            严格输出 JSON，不加任何说明或代码块围栏，直接以 { 开头。

            格式：
            {
              "portfolioSummary": "整体建议（1-2句话，说明本期的核心优先策略）",
              "items": [
                {
                  "id": "原样返回该需求的 ID",
                  "rank": 1,
                  "priority": "STRATEGIC" | "HIGH" | "MEDIUM" | "LOW",
                  "stars": 5,
                  "recommendation": "一句话建议（≤ 20字）",
                  "reason": "建议理由（≤ 40字，必须体现与其他需求的比较）",
                  "impacts": ["影响系统或用户群（3-5个中文标签）"],
                  "roi": "HIGH" | "MEDIUM" | "LOW",
                  "estimatedHours": 40,
                  "comparedTo": "与其他需求相比的差异点（≤ 20字）"
                }
              ]
            }

            排序原则（按重要性依次考虑）：
            1. 业务影响面（影响越多关键流程越优先）
            2. 战略重要性（与核心产品路线图的关联度）
            3. ROI（价值/成本比，高ROI优先）
            4. 实现风险（技术复杂度低的同等条件下优先）
            5. 依赖关系（被其他需求依赖的先做）
            """;

    private final AgentOneShotRunner agentRunner;
    private final ReqItemRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();

    public ReqAnalysisService(AgentOneShotRunner agentRunner, ReqItemRepository repo) {
        this.agentRunner = agentRunner;
        this.repo = repo;
    }

    /**
     * 对指定需求条目执行 AI 洞察分析并将结果持久化。
     *
     * @param item 待分析的需求条目
     * @return 分析结果 JSON 字符串
     */
    public String analyze(ReqItem item) {
        String userPrompt = buildUserPrompt(item);
        try {
            String result = agentRunner.runOnce(SYSTEM, userPrompt, null);
            String cleaned = stripFence(result.trim());
            repo.updateAiInsight(item.getId(), cleaned);
            return cleaned;
        } catch (Exception e) {
            log.warn("[reqpool-analysis] AI 分析失败 itemId={}: {}", item.getId(), e.getMessage());
            throw new RuntimeException("AI 分析失败：" + e.getMessage(), e);
        }
    }

    /**
     * Portfolio 全局分析：把所有需求一起发给 Claude，让它横向对比后给出相对优先级排序。
     * 每条需求的 ai_insight 会被更新为携带 rank + comparedTo 字段的新 JSON。
     *
     * @param items 待分析的需求列表
     * @return portfolioSummary（整体建议文字）
     */
    public String analyzePortfolio(List<ReqItem> items) {
        if (items.isEmpty()) return "暂无需求";

        String userPrompt = buildPortfolioPrompt(items);
        try {
            String raw = agentRunner.runOnce(PORTFOLIO_SYSTEM, userPrompt, null);
            String cleaned = stripFence(raw.trim());

            // 解析 JSON，逐条更新 ai_insight
            JsonNode root = mapper.readTree(cleaned);
            String summary = root.path("portfolioSummary").asText("");
            JsonNode itemsNode = root.path("items");

            if (itemsNode.isArray()) {
                for (JsonNode node : itemsNode) {
                    String id = node.path("id").asText("");
                    if (!id.isBlank()) {
                        // 直接用 portfolio 分析结果（含 rank + comparedTo）覆盖 ai_insight
                        repo.updateAiInsight(id, mapper.writeValueAsString(node));
                    }
                }
            }

            log.info("[reqpool-portfolio] 分析完成，共 {} 条，摘要：{}", items.size(), summary);
            return summary;

        } catch (Exception e) {
            log.warn("[reqpool-portfolio] Portfolio 分析失败：{}", e.getMessage());
            throw new RuntimeException("Portfolio 分析失败：" + e.getMessage(), e);
        }
    }

    private String buildPortfolioPrompt(List<ReqItem> items) {
        StringBuilder sb = new StringBuilder();
        sb.append("待优先级排序的需求列表（共 ").append(items.size()).append(" 条）：\n\n");

        for (int i = 0; i < items.size(); i++) {
            ReqItem item = items.get(i);
            sb.append("需求 #").append(i + 1)
              .append("（ID: ").append(item.getId()).append("）\n");
            sb.append("标题：").append(item.getTitle()).append("\n");
            if (item.getProject() != null) sb.append("项目：").append(item.getProject()).append("\n");
            if (item.getModule() != null) sb.append("模块：").append(item.getModule()).append("\n");
            if (item.getDescription() != null && !item.getDescription().isBlank()) {
                String desc = item.getDescription().strip();
                // 截断超长描述，避免超出 context
                if (desc.length() > 300) desc = desc.substring(0, 300) + "…";
                sb.append("描述：").append(desc).append("\n");
            }
            sb.append("\n");
        }

        sb.append("请综合对比以上所有需求，输出相对优先级排序 JSON：");
        return sb.toString();
    }

    private String buildUserPrompt(ReqItem item) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(item.getTitle()).append("\n");
        if (item.getProject() != null) sb.append("项目：").append(item.getProject()).append("\n");
        if (item.getModule() != null) sb.append("模块：").append(item.getModule()).append("\n");
        if (item.getDescription() != null && !item.getDescription().isBlank()) {
            sb.append("\n需求描述：\n").append(item.getDescription().strip()).append("\n");
        }
        sb.append("\n请输出需求价值分析 JSON：");
        return sb.toString();
    }

    private static String stripFence(String s) {
        if (s.startsWith("```")) {
            int start = s.indexOf('\n');
            int end = s.lastIndexOf("```");
            if (start > 0 && end > start) {
                return s.substring(start + 1, end).trim();
            }
        }
        return s;
    }
}
