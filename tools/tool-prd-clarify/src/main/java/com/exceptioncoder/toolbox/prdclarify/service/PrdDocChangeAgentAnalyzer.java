package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.AnalysisExecutionProfile;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptDefinition;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose;
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

    private static final Set<String> DECISIONS =
            Set.of("NONE", "PRD_ONLY", "TDD_ONLY", "BOTH", "UNCERTAIN");
    private static final Set<String> CHANGE_CAUSES = Set.of(
            "REQUIREMENT_AMBIGUITY", "BUSINESS_CHANGE", "TECHNICAL_GAP", "DATA_MODEL_GAP",
            "IMPLEMENTATION_DISCOVERY", "MIXED", "OTHER");
    private static final Set<String> DIFF_STATUSES = Set.of(
            "MATCHED", "MISMATCH", "PROPOSED", "CONFIRMED", "UNRESOLVED", "OUT_OF_SCOPE");

    private final AgentOneShotRunner runner;
    private final ObjectMapper mapper;
    private final PrdPromptCatalog promptCatalog;
    private final PrdAiRunService aiRunService;

    public PrdDocChangeAgentAnalyzer(AgentOneShotRunner runner, ObjectMapper mapper,
                                     PrdPromptCatalog promptCatalog, PrdAiRunService aiRunService) {
        this.runner = runner;
        this.mapper = mapper;
        this.promptCatalog = promptCatalog;
        this.aiRunService = aiRunService;
    }

    /** 对证据包执行第一阶段事实分析。 */
    public PrdDocChangeAnalysisResult analyze(PrdDocChangeEvidenceBundle bundle) {
        return analyzeWithAudit(bundle).result();
    }

    /** 对证据包执行第一阶段事实分析，并返回本次运行身份。 */
    public AuditedAnalysis analyzeWithAudit(PrdDocChangeEvidenceBundle bundle) {
        PrdPromptDefinition prompt = promptCatalog.get(PrdPromptPurpose.DOC_CHANGE_ANALYZER);
        String userPrompt = buildPrompt(bundle, prompt.version());
        AnalysisExecutionProfile profile = requireProfile(bundle);
        PrdAiRunService.RunHandle run = aiRunService.begin(
                prompt, userPrompt, new PrdAiRunService.RunContext(null, profile.engine(), profile.model()));
        String raw = null;
        try {
            raw = runner.runOnce(request(profile, prompt.systemPrompt(), userPrompt));
            PrdDocChangeAnalysisResult result = parse(raw);
            if (result.parsed()) {
                aiRunService.succeed(run, raw);
            } else {
                aiRunService.fail(run, raw, result.reasoning());
            }
            return new AuditedAnalysis(result, run.id());
        } catch (Exception e) {
            aiRunService.fail(run, raw, "分析器执行失败：" + e.getMessage());
            return new AuditedAnalysis(invalid("分析器执行失败：" + e.getMessage()), run.id());
        }
    }

    private AnalysisExecutionProfile requireProfile(PrdDocChangeEvidenceBundle bundle) {
        AnalysisExecutionProfile profile = bundle.executionProfile();
        if (profile == null) {
            throw new IllegalStateException("开发会话未提供分析执行配置");
        }
        return profile;
    }

    private ExecutionRequest request(AnalysisExecutionProfile profile, String systemPrompt, String userPrompt) {
        return new ExecutionRequest(systemPrompt, userPrompt, profile.cwd(), profile.model(), profile.engine(),
                profile.reasoningEffort(), profile.speed(), profile.apiBaseUrl(), profile.authToken(),
                profile.codexHome(), AgentOneShotRunner.TOOL_POLICY_DISABLED);
    }

    private String buildPrompt(PrdDocChangeEvidenceBundle bundle, String promptVersion) {
        ObjectNode payload = mapper.createObjectNode();
        payload.put("promptVersion", promptVersion);
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

    /** 第一阶段分析结果及其可关联运行身份。 */
    public record AuditedAnalysis(PrdDocChangeAnalysisResult result, String runId) {
    }
}
