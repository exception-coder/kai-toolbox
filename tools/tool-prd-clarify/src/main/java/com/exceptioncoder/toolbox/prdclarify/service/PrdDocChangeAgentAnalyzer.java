package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.AnalysisExecutionProfile;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.stream.StreamSupport;

/** 使用当前开发会话的引擎配置，从确定性证据中提取事实并判断文档影响。 */
@Service
public class PrdDocChangeAgentAnalyzer {

    private static final String PROMPT_VERSION = "v2-evidence";
    private static final Set<String> DECISIONS =
            Set.of("NONE", "PRD_ONLY", "TDD_ONLY", "BOTH", "UNCERTAIN");
    private static final Set<String> CHANGE_CAUSES = Set.of(
            "REQUIREMENT_AMBIGUITY", "BUSINESS_CHANGE", "TECHNICAL_GAP", "DATA_MODEL_GAP",
            "IMPLEMENTATION_DISCOVERY", "MIXED", "OTHER");
    private static final Set<String> DIFF_STATUSES = Set.of(
            "MATCHED", "MISMATCH", "PROPOSED", "CONFIRMED", "UNRESOLVED", "OUT_OF_SCOPE");
    private static final String SYSTEM_PROMPT = """
            你是软件交付文档的证据分析器。你只能依据输入中的证据项，不得调用工具或补造事实。
            先区分：
            - CONFIRMED_REQUIREMENT：用户最终确认的业务事实
            - REJECTED_OPTION：被否定或撤销的方案
            - IMPLEMENTED_TECHNICAL_FACT：代码或工具结果支持的实现事实
            - PROPOSED_TECHNICAL_DECISION：用户在会话中已确认、但尚未编码的技术或数据设计决策
            - DISCUSSION_ONLY：探索性讨论
            - CONFLICT：对话、代码和文档之间冲突
            - MISSING_DECISION：只能由用户决定的业务缺口

            判定范围：NONE、PRD_ONLY、TDD_ONLY、BOTH、UNCERTAIN。
            被否定方案和纯讨论不得驱动正式文档更新。每条 claim 必须引用输入中存在的 evidenceIds。
            Git 不是文档更新的前置条件。新增会话中已确认的需求可驱动 PRD/TDD 更新；已确认但尚未编码的
            技术选型、接口、库表或数据模型决策应标为 PROPOSED_TECHNICAL_DECISION，并可驱动 TDD 更新。
            PREVIOUS_ANALYSIS 是上次分析基线，不得把它误判为本轮新增事实；应与本轮增量会话及当前文档比较。
            先充分阅读当前 PRD、当前 TDD、上次分析结论和本轮全部增量会话/工具/Git 证据，再汇总差异。
            证据优先级固定为：正式 PRD/TDD 最新版本 > Git 真实代码 > 数据库/配置/接口/页面等工具读取结果
            > 用户明确确认 > LLM 分析、建议和推断。低等级证据不能覆盖高等级事实；LLM 建议永远不能证明正式文档已变更。
            summary 必须是可直接交给文档生成器的差异总览；prdPatchPlan/tddPatchPlan 必须写清楚
            “现状、应改为、影响章节/接口/数据结构”，后续生成器将严格以这些差异结果更新文档。
            必须输出 diffLedger。建议、推断或拟议文本只能标为 PROPOSED；用户明确同意但正式文档尚未写回只能标为 CONFIRMED；
            正式文档与高等级证据冲突标为 MISMATCH；仍需用户决策标为 UNRESOLVED；明确排除标为 OUT_OF_SCOPE。
            只有当前正式 PRD/TDD 内容已经与证据一致时才可标 MATCHED。分析阶段禁止输出 APPLIED 或 VERIFIED。
            如果 PREVIOUS_ANALYSIS 中已有差异 ID，必须沿用该 ID 并根据本轮正式文档与新增证据更新状态，不得另造重复项。
            只要存在 UNRESOLVED，或业务决策仍是 PROPOSED，decision 必须为 UNCERTAIN 并提出唯一最阻塞的确认问题。
            变更原因必须独立于“更新哪些文档”进行归因，只能选择一个最符合证据的主因：
            - REQUIREMENT_AMBIGUITY：原始需求或既有 PRD 表述不清，后续澄清才明确
            - BUSINESS_CHANGE：业务规则、边界或范围在原确认后发生变化
            - TECHNICAL_GAP：既有 TDD 遗漏架构、接口、依赖、异常处理或非功能设计
            - DATA_MODEL_GAP：既有设计遗漏库表、字段、关系、迁移或数据兼容
            - IMPLEMENTATION_DISCOVERY：开发实施过程中才发现新的客观约束或事实
            - MIXED：存在两个以上同等关键且无法归入单一主因的原因
            - OTHER：证据支持的原因确实不属于以上类别
            changeCauseDetail 必须引用本轮证据说明“原文档缺了什么、什么新事实导致更新”，不能只复述 PRD_ONLY/TDD_ONLY/BOTH。
            UNCERTAIN 时 clarificationQuestion 只允许一个最阻塞的问题；其他判定必须为空。
            只输出 JSON，不要 Markdown：
            {
              "decision":"NONE|PRD_ONLY|TDD_ONLY|BOTH|UNCERTAIN",
              "summary":"",
              "reasoning":"",
              "changeCauseType":"REQUIREMENT_AMBIGUITY|BUSINESS_CHANGE|TECHNICAL_GAP|DATA_MODEL_GAP|IMPLEMENTATION_DISCOVERY|MIXED|OTHER",
              "changeCauseDetail":"基于证据说明为什么现有 PRD/TDD 产生差距，不要只复述更新范围",
              "diffLedger":[{
                "id":"DIFF-001|DEC-001",
                "sourceDocument":"PRD|TDD|BOTH",
                "sourceSection":"",
                "currentDocument":"正式文档当前内容",
                "evidenceLevel":"DOCUMENT|CODE|TOOL|USER_CONFIRMED|LLM_PROPOSAL",
                "evidenceIds":["DOC-TDD","CONV-0001"],
                "actualEvidence":"真实证据或新结论",
                "proposedChange":"建议修改",
                "changeKind":"CODE_FACT|BUSINESS_DECISION",
                "status":"MATCHED|MISMATCH|PROPOSED|CONFIRMED|UNRESOLVED|OUT_OF_SCOPE"
              }],
              "claims":[
                {"type":"","statement":"","evidenceIds":["CONV-0001"],"documentImpact":"PRD|TDD|BOTH|NONE"}
              ],
              "prdPatchPlan":[],
              "tddPatchPlan":[],
              "risks":[],
              "clarificationQuestion":"",
              "modelConfidence":0
            }
            """;

    private final AgentOneShotRunner runner;
    private final ObjectMapper mapper;

    public PrdDocChangeAgentAnalyzer(AgentOneShotRunner runner, ObjectMapper mapper) {
        this.runner = runner;
        this.mapper = mapper;
    }

    /** 对证据包执行第一阶段事实分析。 */
    public PrdDocChangeAnalysisResult analyze(PrdDocChangeEvidenceBundle bundle) {
        try {
            String raw = runner.runOnce(request(bundle, SYSTEM_PROMPT, buildPrompt(bundle)));
            return parse(raw);
        } catch (Exception e) {
            return invalid("分析器执行失败：" + e.getMessage());
        }
    }

    private ExecutionRequest request(PrdDocChangeEvidenceBundle bundle, String systemPrompt, String userPrompt) {
        AnalysisExecutionProfile profile = bundle.executionProfile();
        if (profile == null) {
            throw new IllegalStateException("开发会话未提供分析执行配置");
        }
        return new ExecutionRequest(systemPrompt, userPrompt, profile.cwd(), profile.model(), profile.engine(),
                profile.reasoningEffort(), profile.speed(), profile.apiBaseUrl(), profile.authToken(),
                profile.codexHome(), AgentOneShotRunner.TOOL_POLICY_DISABLED);
    }

    private String buildPrompt(PrdDocChangeEvidenceBundle bundle) {
        ObjectNode payload = mapper.createObjectNode();
        payload.put("promptVersion", PROMPT_VERSION);
        payload.put("title", bundle.title());
        payload.put("project", value(bundle.project()));
        payload.put("module", value(bundle.module()));
        payload.set("evidence", mapper.valueToTree(bundle.evidence()));
        payload.set("collectionWarnings", mapper.valueToTree(bundle.warnings()));
        try {
            return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("序列化分析证据失败", e);
        }
    }

    private PrdDocChangeAnalysisResult parse(String raw) {
        try {
            JsonNode node = mapper.readTree(stripFence(raw));
            String decision = node.path("decision").asText("").toUpperCase();
            if (!DECISIONS.contains(decision)) {
                throw new IllegalArgumentException("decision 非法");
            }
            String causeType = text(node, "changeCauseType").toUpperCase();
            if (!CHANGE_CAUSES.contains(causeType)) {
                causeType = "OTHER";
            }
            String causeDetail = text(node, "changeCauseDetail");
            if (causeDetail.isBlank()) {
                causeDetail = text(node, "reasoning");
            }
            String question = node.path("clarificationQuestion").asText("").trim();
            if ("UNCERTAIN".equals(decision) && question.isBlank()) {
                question = "当前证据不足，请补充这次最终确认的核心变化。";
            } else if (!"UNCERTAIN".equals(decision)) {
                question = "";
            }
            return new PrdDocChangeAnalysisResult(decision, text(node, "summary"), text(node, "reasoning"),
                    causeType, causeDetail, diffLedger(node.path("diffLedger")),
                    claims(node.path("claims")), strings(node.path("prdPatchPlan")),
                    strings(node.path("tddPatchPlan")), strings(node.path("risks")), question,
                    clamp(node.path("modelConfidence").asInt(0)), true);
        } catch (Exception e) {
            return invalid("分析器未返回符合契约的 JSON：" + e.getMessage());
        }
    }

    private PrdDocChangeAnalysisResult invalid(String reason) {
        return new PrdDocChangeAnalysisResult("UNCERTAIN",
                "AI 分析结果不足以安全更新正式文档", reason, "OTHER", reason,
                List.of(), List.of(), List.of(), List.of(),
                List.of("可重试分析，或补充最终确认结论"),
                "请补充这次开发最终确认并实际落地的核心变化。", 0, false);
    }

    private List<PrdDocChangeAnalysisResult.Claim> claims(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        return StreamSupport.stream(node.spliterator(), false)
                .map(item -> new PrdDocChangeAnalysisResult.Claim(
                        text(item, "type").toUpperCase(),
                        text(item, "statement"),
                        strings(item.path("evidenceIds")),
                        text(item, "documentImpact").toUpperCase()))
                .filter(claim -> !claim.statement().isBlank())
                .toList();
    }

    private List<PrdDocDiffItem> diffLedger(JsonNode node) {
        if (!node.isArray()) return List.of();
        java.util.ArrayList<PrdDocDiffItem> result = new java.util.ArrayList<>();
        int diff = 1;
        int decision = 1;
        for (JsonNode item : node) {
            String kind = text(item, "changeKind").toUpperCase();
            if (!Set.of("CODE_FACT", "BUSINESS_DECISION").contains(kind)) kind = "CODE_FACT";
            String id = text(item, "id").toUpperCase();
            if (id.isBlank()) id = "BUSINESS_DECISION".equals(kind)
                    ? "DEC-%03d".formatted(decision++) : "DIFF-%03d".formatted(diff++);
            String status = text(item, "status").toUpperCase();
            if (!DIFF_STATUSES.contains(status)) status = "PROPOSED";
            result.add(new PrdDocDiffItem(id, text(item, "sourceDocument").toUpperCase(),
                    text(item, "sourceSection"), text(item, "currentDocument"),
                    text(item, "evidenceLevel").toUpperCase(), strings(item.path("evidenceIds")),
                    text(item, "actualEvidence"), text(item, "proposedChange"), kind, status));
        }
        return List.copyOf(result);
    }

    private static List<String> strings(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        return StreamSupport.stream(node.spliterator(), false)
                .map(JsonNode::asText)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    private static String stripFence(String value) {
        String cleaned = value == null ? "" : value.trim();
        if (cleaned.startsWith("```")) {
            int newline = cleaned.indexOf('\n');
            cleaned = newline >= 0 ? cleaned.substring(newline + 1) : cleaned;
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3);
        }
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        return start >= 0 && end >= start ? cleaned.substring(start, end + 1) : cleaned;
    }
}
