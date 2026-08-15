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
import java.util.stream.StreamSupport;

/** 独立复核分析器的证据引用、结论覆盖度与范围一致性。 */
@Service
public class PrdDocChangeAgentVerifier {

    private static final java.util.Set<String> DECISIONS =
            java.util.Set.of("NONE", "PRD_ONLY", "TDD_ONLY", "BOTH", "UNCERTAIN");

    private final AgentOneShotRunner runner;
    private final ObjectMapper mapper;
    private final PrdPromptCatalog promptCatalog;
    private final PrdAiRunService aiRunService;

    public PrdDocChangeAgentVerifier(AgentOneShotRunner runner, ObjectMapper mapper,
                                     PrdPromptCatalog promptCatalog, PrdAiRunService aiRunService) {
        this.runner = runner;
        this.mapper = mapper;
        this.promptCatalog = promptCatalog;
        this.aiRunService = aiRunService;
    }

    /** 对第一阶段分析执行独立复核；分析格式已失败时不再消耗第二次调用。 */
    public PrdDocChangeVerificationResult verify(PrdDocChangeEvidenceBundle bundle,
                                                  PrdDocChangeAnalysisResult analysis) {
        return verifyWithAudit(bundle, analysis).result();
    }

    /** 对第一阶段分析执行独立复核，并返回本次运行身份。 */
    public AuditedVerification verifyWithAudit(PrdDocChangeEvidenceBundle bundle,
                                                PrdDocChangeAnalysisResult analysis) {
        if (!analysis.parsed()) {
            return new AuditedVerification(failed("分析器结果不可解析，未执行复核"), null);
        }
        PrdPromptDefinition prompt = promptCatalog.get(PrdPromptPurpose.DOC_CHANGE_VERIFIER);
        String userPrompt = buildPrompt(bundle, analysis);
        AnalysisExecutionProfile profile = requireProfile(bundle);
        PrdAiRunService.RunHandle run = aiRunService.begin(
                prompt, userPrompt, new PrdAiRunService.RunContext(null, profile.engine(), profile.model()));
        String raw = null;
        try {
            raw = runner.runOnce(request(profile, prompt.systemPrompt(), userPrompt));
            PrdDocChangeVerificationResult result = parse(raw);
            if (valid(result)) {
                aiRunService.succeed(run, raw);
            } else {
                aiRunService.fail(run, raw, firstNote(result));
            }
            return new AuditedVerification(result, run.id());
        } catch (Exception e) {
            aiRunService.fail(run, raw, "复核器执行失败：" + e.getMessage());
            return new AuditedVerification(failed("复核器执行失败：" + e.getMessage()), run.id());
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

    private String buildPrompt(PrdDocChangeEvidenceBundle bundle, PrdDocChangeAnalysisResult analysis) {
        ObjectNode payload = mapper.createObjectNode();
        payload.set("evidence", mapper.valueToTree(bundle.evidence()));
        payload.set("analysis", mapper.valueToTree(analysis));
        try {
            return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("序列化复核上下文失败", e);
        }
    }

    private PrdDocChangeVerificationResult parse(String raw) {
        try {
            JsonNode node = mapper.readTree(stripFence(raw));
            String recommendedDecision = node.path("recommendedDecision").asText("").toUpperCase();
            if (!DECISIONS.contains(recommendedDecision)) {
                throw new IllegalArgumentException("recommendedDecision 非法");
            }
            return new PrdDocChangeVerificationResult(
                    node.path("verified").asBoolean(false),
                    recommendedDecision,
                    integers(node.path("unsupportedClaimIndexes")),
                    strings(node.path("missingEvidenceIds")),
                    strings(node.path("conflicts")),
                    Math.max(-30, Math.min(20, node.path("confidenceAdjustment").asInt(0))),
                    strings(node.path("notes")));
        } catch (Exception e) {
            return failed("复核器未返回符合契约的 JSON：" + e.getMessage());
        }
    }

    private PrdDocChangeVerificationResult failed(String note) {
        return new PrdDocChangeVerificationResult(
                false, "UNCERTAIN", List.of(), List.of(), List.of(), -30, List.of(note));
    }

    private static boolean valid(PrdDocChangeVerificationResult result) {
        return result.notes().stream().noneMatch(note -> note.startsWith("复核器未返回符合契约的 JSON"));
    }

    private static String firstNote(PrdDocChangeVerificationResult result) {
        return result.notes().isEmpty() ? "复核器输出未通过契约校验" : result.notes().get(0);
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

    private static List<Integer> integers(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        return StreamSupport.stream(node.spliterator(), false)
                .filter(JsonNode::canConvertToInt)
                .map(JsonNode::asInt)
                .toList();
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

    /** 第二阶段复核结果及其可关联运行身份；未调用模型时 runId 为空。 */
    public record AuditedVerification(PrdDocChangeVerificationResult result, String runId) {
    }
}
