package com.exceptioncoder.toolbox.prdclarify.api.dto;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

/** 文档变更候选的前端视图；数据库 JSON 字符串在 API 边界转成数组。 */
public record PrdDocChangeCandidateView(
        String id,
        String prdSessionId,
        String devSessionId,
        long conversationFromSeq,
        long conversationToSeq,
        String decision,
        String aiDecision,
        String summary,
        String reasoning,
        List<String> evidence,
        List<String> prdPatchPlan,
        List<String> tddPatchPlan,
        List<String> risks,
        String clarificationQuestion,
        int confidence,
        String status,
        String applyStage,
        String lastError,
        Long prdAppliedAt,
        Long tddAppliedAt,
        long createdAt,
        long updatedAt
) {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static PrdDocChangeCandidateView from(PrdDocChangeCandidate candidate) {
        if (candidate == null) {
            return null;
        }
        return new PrdDocChangeCandidateView(
                candidate.getId(), candidate.getPrdSessionId(), candidate.getDevSessionId(),
                candidate.getConversationFromSeq(), candidate.getConversationToSeq(),
                candidate.getDecision(), candidate.getAiDecision(), candidate.getSummary(),
                candidate.getReasoning(), strings(candidate.getEvidenceJson()),
                strings(candidate.getPrdPatchPlanJson()), strings(candidate.getTddPatchPlanJson()),
                strings(candidate.getRisksJson()), candidate.getClarificationQuestion(),
                candidate.getConfidence(), candidate.getStatus(), candidate.getApplyStage(),
                candidate.getLastError(), candidate.getPrdAppliedAt(), candidate.getTddAppliedAt(),
                candidate.getCreatedAt(), candidate.getUpdatedAt());
    }

    private static List<String> strings(String json) {
        try {
            JsonNode node = MAPPER.readTree(json == null ? "[]" : json);
            if (!node.isArray()) {
                return List.of();
            }
            return java.util.stream.StreamSupport.stream(node.spliterator(), false)
                    .map(JsonNode::asText)
                    .toList();
        } catch (Exception e) {
            return List.of();
        }
    }
}
