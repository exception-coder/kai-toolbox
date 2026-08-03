package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.AnalysisExecutionProfile;
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
    private static final String SYSTEM_PROMPT = """
            你是文档变更分析复核器。只能检查给定分析是否被给定证据支持，不得创造新事实。
            检查证据 ID 是否存在、claim 是否被证据直接支持、decision 是否覆盖 claims、
            是否遗漏明显冲突。recommendedDecision 若不同，必须能由已有证据支持。
            同时逐项检查 diffLedger：标为 MATCHED 的项必须能从最新 DOC-PRD/DOC-TDD 与真实证据中直接核实；
            PROPOSED/CONFIRMED 只能表示建议或决策，不能当作文档已落档。存在虚假的 MATCHED 时 verified 必须为 false。
            你是审计复核而不是规则裁决器；不要因为没有 Git、没有代码实现或证据类型不符合固定模板就否定主分析。
            会话中确认的新业务说明、技术方案和数据设计本身就是有效上下文。
            复核时以最新正式 PRD/TDD 为落档事实；会话中的建议、总结和拟议文本均不得作为“文档已写回”的证明。
            Git 不是必要证据：用户会话可以支持已确认需求；用户已确认但尚未编码的技术、接口、库表或
            数据模型决策可以支持 TDD 更新。PREVIOUS_ANALYSIS 只代表上次分析基线，本轮变化应由增量证据支持。
            只输出 JSON：
            {
              "verified":true,
              "recommendedDecision":"NONE|PRD_ONLY|TDD_ONLY|BOTH|UNCERTAIN",
              "unsupportedClaimIndexes":[],
              "missingEvidenceIds":[],
              "conflicts":[],
              "confidenceAdjustment":0,
              "notes":[]
            }
            """;

    private final AgentOneShotRunner runner;
    private final ObjectMapper mapper;

    public PrdDocChangeAgentVerifier(AgentOneShotRunner runner, ObjectMapper mapper) {
        this.runner = runner;
        this.mapper = mapper;
    }

    /** 对第一阶段分析执行独立复核；分析格式已失败时不再消耗第二次调用。 */
    public PrdDocChangeVerificationResult verify(PrdDocChangeEvidenceBundle bundle,
                                                 PrdDocChangeAnalysisResult analysis) {
        if (!analysis.parsed()) {
            return failed("分析器结果不可解析，未执行复核");
        }
        try {
            String raw = runner.runOnce(request(bundle, buildPrompt(bundle, analysis)));
            return parse(raw);
        } catch (Exception e) {
            return failed("复核器执行失败：" + e.getMessage());
        }
    }

    private ExecutionRequest request(PrdDocChangeEvidenceBundle bundle, String prompt) {
        AnalysisExecutionProfile profile = bundle.executionProfile();
        if (profile == null) {
            throw new IllegalStateException("开发会话未提供分析执行配置");
        }
        return new ExecutionRequest(SYSTEM_PROMPT, prompt, profile.cwd(), profile.model(), profile.engine(),
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
}
