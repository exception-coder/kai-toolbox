package com.exceptioncoder.toolbox.reqpool.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 把模型 JSON 收敛为可落库的确定性洞察契约。 */
@Component
public class ReqInsightValidator {

    private static final Set<String> PRIORITIES = Set.of("STRATEGIC", "HIGH", "MEDIUM", "LOW");
    private static final Set<String> ROI_LEVELS = Set.of("HIGH", "MEDIUM", "LOW");
    private final ObjectMapper mapper;

    public ReqInsightValidator(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public String validateItem(String rawJson) {
        JsonNode root = parseObject(rawJson, "单条洞察");
        validateCommon(root, false);
        return serialize(root);
    }

    public ValidatedPortfolio validatePortfolio(String rawJson, Set<String> expectedIds) {
        JsonNode root = parseObject(rawJson, "组合洞察");
        String summary = requiredText(root, "portfolioSummary", 200);
        JsonNode items = root.get("items");
        if (items == null || !items.isArray()) {
            throw invalid("组合洞察 items 必须是数组");
        }
        if (items.size() != expectedIds.size()) {
            throw invalid("组合洞察必须返回全部输入需求");
        }

        Set<String> returnedIds = new HashSet<>();
        Set<Integer> ranks = new HashSet<>();
        Map<String, String> payloadById = new LinkedHashMap<>();
        for (JsonNode item : items) {
            if (!item.isObject()) {
                throw invalid("组合洞察的每一项必须是对象");
            }
            String id = requiredText(item, "id", 100);
            if (!expectedIds.contains(id)) {
                throw invalid("组合洞察包含输入集合外的 ID: " + id);
            }
            if (!returnedIds.add(id)) {
                throw invalid("组合洞察包含重复 ID: " + id);
            }
            int rank = requiredInteger(item, "rank", 1, expectedIds.size());
            if (!ranks.add(rank)) {
                throw invalid("组合洞察包含重复排名: " + rank);
            }
            validateCommon(item, true);
            payloadById.put(id, serialize(item));
        }
        if (!returnedIds.equals(expectedIds)) {
            throw invalid("组合洞察返回的 ID 集合与输入不一致");
        }
        return new ValidatedPortfolio(summary, payloadById);
    }

    private void validateCommon(JsonNode root, boolean portfolio) {
        requiredEnum(root, "priority", PRIORITIES);
        requiredInteger(root, "stars", 1, 5);
        requiredText(root, "recommendation", 40);
        requiredText(root, "reason", 100);
        requiredEnum(root, "roi", ROI_LEVELS);
        requiredInteger(root, "estimatedHours", 0, 100_000);
        if (portfolio) {
            requiredText(root, "comparedTo", 60);
        }

        JsonNode impacts = root.get("impacts");
        if (impacts == null || !impacts.isArray() || impacts.isEmpty() || impacts.size() > 10) {
            throw invalid("impacts 必须是包含 1 至 10 项的数组");
        }
        List<String> normalized = new ArrayList<>();
        impacts.forEach(node -> {
            if (!node.isTextual() || node.asText().isBlank() || node.asText().length() > 40) {
                throw invalid("impacts 只能包含长度不超过 40 的非空文本");
            }
            normalized.add(node.asText());
        });
    }

    private JsonNode parseObject(String rawJson, String label) {
        if (rawJson == null || rawJson.isBlank()) {
            throw invalid(label + "不能为空");
        }
        try {
            JsonNode root = mapper.readTree(rawJson);
            if (root == null || !root.isObject()) {
                throw invalid(label + "必须是 JSON 对象");
            }
            return root;
        } catch (JsonProcessingException exception) {
            throw invalid(label + "不是合法 JSON", exception);
        }
    }

    private static String requiredText(JsonNode node, String field, int maxLength) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw invalid(field + " 必须是非空文本");
        }
        String text = value.asText().strip();
        if (text.length() > maxLength) {
            throw invalid(field + " 长度不能超过 " + maxLength);
        }
        return text;
    }

    private static void requiredEnum(JsonNode node, String field, Set<String> allowed) {
        String value = requiredText(node, field, 30);
        if (!allowed.contains(value)) {
            throw invalid(field + " 不在允许范围内: " + value);
        }
    }

    private static int requiredInteger(JsonNode node, String field, int minimum, int maximum) {
        JsonNode value = node.get(field);
        if (value == null || !value.isIntegralNumber()) {
            throw invalid(field + " 必须是整数");
        }
        int number = value.intValue();
        if (number < minimum || number > maximum) {
            throw invalid(field + " 必须在 " + minimum + " 到 " + maximum + " 之间");
        }
        return number;
    }

    private String serialize(JsonNode node) {
        try {
            return mapper.writeValueAsString(node);
        } catch (JsonProcessingException exception) {
            throw invalid("洞察 JSON 序列化失败", exception);
        }
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }

    private static IllegalArgumentException invalid(String message, Exception cause) {
        return new IllegalArgumentException(message, cause);
    }

    /**
     * 完整校验后的组合结果。
     *
     * @param summary 组合摘要
     * @param payloadById 按输入需求 ID 索引的洞察 JSON
     */
    public record ValidatedPortfolio(String summary, Map<String, String> payloadById) {
    }
}
