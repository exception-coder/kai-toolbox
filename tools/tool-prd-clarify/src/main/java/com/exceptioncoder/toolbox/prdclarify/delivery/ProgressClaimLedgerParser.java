package com.exceptioncoder.toolbox.prdclarify.delivery;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** 解析进度报告中固定边界的结构化 claim JSON。 */
@Component
public class ProgressClaimLedgerParser {

    public static final String START_MARKER = "<!-- DELIVERY_CLAIMS_JSON";
    public static final String END_MARKER = "DELIVERY_CLAIMS_JSON -->";
    private static final int MAX_CLAIMS = 300;
    private static final int MAX_EVIDENCES = 10;
    private static final int MAX_TITLE_LENGTH = 300;
    private static final int MAX_PATH_LENGTH = 1000;
    private static final int MAX_SYMBOL_LENGTH = 300;
    private static final Pattern CLAIM_ID = Pattern.compile("[A-Za-z0-9._-]{1,100}");

    private final ObjectMapper objectMapper;

    public ProgressClaimLedgerParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 从 Markdown 中提取并校验模型提出的 claim ledger。 */
    public ProposedLedger parse(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            throw new IllegalArgumentException("进度报告不能为空");
        }
        int start = markdown.indexOf(START_MARKER);
        int end = start < 0 ? -1 : markdown.indexOf(END_MARKER, start + START_MARKER.length());
        if (start < 0 || end < 0) {
            throw new IllegalArgumentException("进度评估缺少结构化 claim ledger");
        }
        if (markdown.indexOf(START_MARKER, start + START_MARKER.length()) >= 0) {
            throw new IllegalArgumentException("进度评估包含重复 claim ledger");
        }
        String json = markdown.substring(start + START_MARKER.length(), end).trim();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode claimsNode = root.path("claims");
            if (!root.isObject() || !claimsNode.isArray() || claimsNode.isEmpty()) {
                throw new IllegalArgumentException("claim ledger 必须包含非空 claims 数组");
            }
            if (claimsNode.size() > MAX_CLAIMS) {
                throw new IllegalArgumentException("claim 数量超过上限 " + MAX_CLAIMS);
            }
            return new ProposedLedger(parseClaims(claimsNode));
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("claim ledger JSON 无法解析", exception);
        }
    }

    private List<ProposedClaim> parseClaims(JsonNode claimsNode) {
        List<ProposedClaim> claims = new ArrayList<>(claimsNode.size());
        Set<String> ids = new HashSet<>();
        for (JsonNode node : claimsNode) {
            String claimId = requiredText(node, "claimId", 100);
            if (!CLAIM_ID.matcher(claimId).matches() || !ids.add(claimId)) {
                throw new IllegalArgumentException("claimId 非法或重复: " + claimId);
            }
            String title = requiredText(node, "title", MAX_TITLE_LENGTH);
            DeliveryClaimStatus status;
            try {
                status = DeliveryClaimStatus.valueOf(requiredText(node, "status", 20));
            } catch (IllegalArgumentException exception) {
                throw new IllegalArgumentException("claim 状态只允许 COMPLETED/PARTIAL/MISSING", exception);
            }
            claims.add(new ProposedClaim(
                    claimId,
                    title,
                    status,
                    node.path("testItem").asBoolean(false),
                    parseEvidences(node.path("evidence"))));
        }
        return List.copyOf(claims);
    }

    private List<ProposedEvidence> parseEvidences(JsonNode evidenceNode) {
        if (evidenceNode.isMissingNode() || evidenceNode.isNull()) {
            return List.of();
        }
        if (!evidenceNode.isArray() || evidenceNode.size() > MAX_EVIDENCES) {
            throw new IllegalArgumentException("evidence 必须为数组且不超过 " + MAX_EVIDENCES + " 条");
        }
        List<ProposedEvidence> evidences = new ArrayList<>(evidenceNode.size());
        for (JsonNode node : evidenceNode) {
            evidences.add(new ProposedEvidence(
                    requiredText(node, "relativePath", MAX_PATH_LENGTH),
                    node.path("lineStart").asInt(0),
                    node.path("lineEnd").asInt(0),
                    optionalText(node, "symbol", MAX_SYMBOL_LENGTH)));
        }
        return List.copyOf(evidences);
    }

    private static String requiredText(JsonNode node, String field, int maxLength) {
        String value = optionalText(node, field, maxLength);
        if (value == null) {
            throw new IllegalArgumentException(field + " 不能为空");
        }
        return value;
    }

    private static String optionalText(JsonNode node, String field, int maxLength) {
        String value = node.path(field).asText("").trim();
        if (value.isEmpty()) {
            return null;
        }
        if (value.length() > maxLength) {
            throw new IllegalArgumentException(field + " 长度超过上限 " + maxLength);
        }
        return value;
    }

    /** 模型提出的完整 claim 集合。 */
    public record ProposedLedger(List<ProposedClaim> claims) {
    }

    /** 模型提出的一条功能声明。 */
    public record ProposedClaim(
            String claimId,
            String title,
            DeliveryClaimStatus status,
            boolean testItem,
            List<ProposedEvidence> evidences) {
    }

    /** 模型提出的源码坐标，不包含权威摘要。 */
    public record ProposedEvidence(String relativePath, int lineStart, int lineEnd, String symbol) {
    }
}
