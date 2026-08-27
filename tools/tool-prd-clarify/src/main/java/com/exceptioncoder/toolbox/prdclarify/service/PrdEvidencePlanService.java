package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceProject;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScope;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceSourceType;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** 让 Agent 根据受控项目范围制定证据查询计划。 */
@Slf4j
@Service
public class PrdEvidencePlanService {

    private static final int MAX_PLAN_ITEMS = 30;
    private static final String SYSTEM_PROMPT = """
            执行 planning-evidence-discovery 的“制定探索计划”步骤。Forge 已完成第一个动作
            resolve_project_evidence_scope；你只能使用给定 scope 中的项目坐标。
            根据需求、项目关系和来源可用性决定需要查询的证据。不要生成规格，不要调用工具。
            直接输出 JSON 数组，不加 Markdown。每项字段：projectKey、projectPath、sourceType、queryReason。
            sourceType 只能是 DOMAIN_KNOWLEDGE、GRAPHIFY、DDL、ROUTE_MAP、SOURCE、CROSS_PROJECT_TOPOLOGY。
            必须关注 REFACTORS 和 MIGRATES_FROM 来源；普通依赖只在需求确实涉及时选择。
            """;

    private final AgentOneShotRunner agentRunner;
    private final ObjectMapper mapper;

    public PrdEvidencePlanService(AgentOneShotRunner agentRunner, ObjectMapper mapper) {
        this.agentRunner = agentRunner;
        this.mapper = mapper;
    }

    /** 返回通过 scope 校验的动态查询项；规划失败时由完成性门禁补齐必查项。 */
    public List<PlanItem> plan(PrdSession session, ProjectEvidenceScope scope) {
        return plan(session.getTitle(), session.getRawInput(), session.getModule(),
                session.getEngine(), session.getModel(), scope);
    }

    /** 返回通过 scope 校验的动态查询项。 */
    public List<PlanItem> plan(
            String title,
            String description,
            String module,
            String engine,
            String model,
            ProjectEvidenceScope scope
    ) {
        try {
            String prompt = "需求标题：" + value(title) + "\n"
                    + "需求描述：" + value(description) + "\n"
                    + "模块：" + value(module) + "\n"
                    + "受控 scope：\n" + mapper.writeValueAsString(scope);
            AgentOneShotRunner.ExecutionRequest request = new AgentOneShotRunner.ExecutionRequest(
                    SYSTEM_PROMPT, prompt, scope.primary().projectPath(), model,
                    normalizeEngine(engine),
                    "codex".equals(normalizeEngine(engine)) ? "medium" : null,
                    null, null, null, null, AgentOneShotRunner.TOOL_POLICY_DISABLED);
            String raw = agentRunner.runObserved(request, List.of()).text();
            return parse(raw, scope);
        } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException error) {
            log.warn("[prd-evidence] 动态查询计划生成失败，将由服务端门禁补齐必查项", error);
            return List.of();
        }
    }

    private List<PlanItem> parse(String raw, ProjectEvidenceScope scope)
            throws com.fasterxml.jackson.core.JsonProcessingException {
        JsonNode root = mapper.readTree(stripFence(raw));
        if (!root.isArray()) {
            throw new IllegalArgumentException("证据查询计划不是 JSON 数组");
        }
        ArrayList<PlanItem> result = new ArrayList<>();
        for (JsonNode item : root) {
            if (result.size() >= MAX_PLAN_ITEMS) {
                break;
            }
            String projectKey = item.path("projectKey").asText("").trim();
            String projectPath = item.path("projectPath").asText("").trim();
            ProjectEvidenceProject project = scope.projects().stream()
                    .filter(candidate -> candidate.projectKey().equals(projectKey)
                            && candidate.projectPath().equalsIgnoreCase(projectPath))
                    .findFirst().orElse(null);
            if (project == null) {
                continue;
            }
            try {
                ProjectEvidenceSourceType source = ProjectEvidenceSourceType.valueOf(
                        item.path("sourceType").asText("").trim());
                String reason = item.path("queryReason").asText("").trim();
                if (!reason.isBlank()) {
                    result.add(new PlanItem(project, source, reason));
                }
            } catch (IllegalArgumentException ignored) {
                // 非法枚举由服务端丢弃，不让模型扩大工具范围。
            }
        }
        return result.stream().distinct().toList();
    }

    private static String stripFence(String raw) {
        String text = value(raw).trim();
        if (text.startsWith("```")) {
            int newline = text.indexOf('\n');
            int end = text.lastIndexOf("```");
            if (newline >= 0 && end > newline) {
                return text.substring(newline + 1, end).trim();
            }
        }
        return text;
    }

    private static String normalizeEngine(String engine) {
        return "codex".equalsIgnoreCase(engine) ? "codex" : AgentOneShotRunner.DEFAULT_ENGINE;
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    /**
     * @param project 受控项目坐标
     * @param sourceType 证据来源
     * @param queryReason 动态计划选择原因
     */
    public record PlanItem(
            ProjectEvidenceProject project,
            ProjectEvidenceSourceType sourceType,
            String queryReason
    ) {
    }
}
