package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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

    private final AgentOneShotRunner agentRunner;
    private final ReqItemRepository repo;

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
