package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementValueTypes;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/** 只修复可逐字回溯的格式差异；每个字段独立裁决。 */
final class ProcurementFieldReview {
    static final String VERSION = "field-review-v2";
    private final ObjectMapper mapper;
    ProcurementFieldReview(ObjectMapper mapper) { this.mapper = mapper; }

    ObjectNode review(JsonNode result, String text, Set<String> allowed, Consumer<JsonNode> validate) {
        if (result == null || !result.isObject() || result.size() != 1
                || !result.path("facts").isArray() || result.path("facts").size() > 100) {
            throw new IllegalArgumentException("输出必须是仅含 facts 数组的对象，最多100项");
        }
        var report = mapper.createObjectNode();
        var accepted = report.putArray("facts");
        var rejected = report.putArray("rejected");
        var repairs = report.putArray("repairs");
        for (JsonNode original : result.path("facts")) {
            String field = original.path("field").asText();
            try {
                if (!allowed.contains(field)) { throw new IllegalArgumentException("字段不在本轮允许范围内"); }
                if (!original.isObject()) { throw new IllegalArgumentException("字段必须是对象"); }
                ObjectNode fact = original.deepCopy();
                repair(fact, text, repairs);
                validate.accept(mapper.createObjectNode().set("facts", mapper.createArrayNode().add(fact)));
                accepted.add(fact);
            } catch (IllegalArgumentException e) {
                rejected.addObject().put("field", field).put("reason", e.getMessage()).set("fact", original);
            }
        }
        return report;
    }

    private void repair(ObjectNode fact, String text, ArrayNode repairs) {
        String field = fact.path("field").asText();
        String evidence = fact.path("evidence").asText();
        String aligned = align(text, evidence);
        if (aligned != null && !aligned.equals(evidence)) {
            fact.put("evidence", aligned);
            repairs.addObject().put("field", field).put("rule", "UNIQUE_WHITESPACE_EVIDENCE");
            evidence = aligned;
        }
        String value = fact.path("value").asText();
        if ("procurement_amount".equals(field) && evidence.contains(value)) {
            var amount = ProcurementValueTypes.AMOUNT.matcher(value);
            if (amount.find()) {
                String span = amount.group().strip();
                if (!amount.find() && !span.equals(value)) {
                    fact.put("value", span);
                    repairs.addObject().put("field", field).put("rule", "UNIQUE_EXPLICIT_AMOUNT_SPAN");
                    return;
                }
            }
        }
        if ("procurement_amount".equals(field) && value.matches("[0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?")) {
            var matcher = ProcurementValueTypes.LABELED_AMOUNT.matcher(evidence);
            List<String> matches = new ArrayList<>();
            while (matcher.find()) {
                if (matcher.group(2).equals(value)) { matches.add(matcher.group()); }
            }
            if (matches.size() == 1) {
                fact.put("value", matches.getFirst());
                repairs.addObject().put("field", field).put("rule", "EXPLICIT_LABEL_UNIT");
                return;
            }
        }
        String alignedValue = align(evidence, value);
        if (alignedValue != null && !alignedValue.equals(value)) {
            fact.put("value", alignedValue);
            repairs.addObject().put("field", field).put("rule", "UNIQUE_WHITESPACE_VALUE");
        }
    }

    /** 保留实际原文空白，只接受唯一连续匹配，避免把不同段落拼成证据。 */
    private static String align(String text, String quote) {
        if (quote.isBlank() || quote.length() > 4000 || text.contains(quote)) { return null; }
        String[] parts = quote.strip().split("[\\s\\p{Z}]+");
        String regex = java.util.Arrays.stream(parts).map(Pattern::quote)
                .collect(java.util.stream.Collectors.joining("[\\s\\p{Z}]+"));
        var match = Pattern.compile(regex).matcher(text);
        if (!match.find()) { return null; }
        String found = match.group();
        return match.find() ? null : found;
    }
}
