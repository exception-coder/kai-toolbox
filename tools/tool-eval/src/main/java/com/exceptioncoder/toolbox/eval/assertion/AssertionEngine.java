package com.exceptioncoder.toolbox.eval.assertion;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * L2 断言引擎：纯函数、零 IO、零 LLM。给定实际输出与断言配置，判定通过与否并给出加权分。
 * <p>
 * 这是「确定性优先」的落点——评测本身若依赖 LLM 打分，评测结果自己就会漂移，
 * 回归对比出来的差异便分不清是被测系统退化还是裁判退化。
 */
@Component
public class AssertionEngine {

    /**
     * @param actual 被测输出，可能为 null（解析失败）
     * @param specs  断言配置；空列表视为无从判定，一律判负
     */
    public Verdict evaluate(JsonNode actual, List<AssertionSpec> specs) {
        if (specs == null || specs.isEmpty()) {
            return new Verdict(false, 0.0, List.of(new AssertionOutcome(
                    "NONE", "", false, 1.0, "至少一条断言", "无断言配置",
                    "用例未配置断言且无法从期望值推导，判负——静默通过比失败更危险")));
        }
        List<AssertionOutcome> outcomes = new ArrayList<>(specs.size());
        double totalWeight = 0;
        double gained = 0;
        for (AssertionSpec spec : specs) {
            AssertionOutcome outcome = check(actual, spec);
            outcomes.add(outcome);
            totalWeight += outcome.weight();
            if (outcome.passed()) {
                gained += outcome.weight();
            }
        }
        double score = totalWeight <= 0 ? 0 : gained / totalWeight;
        boolean passed = outcomes.stream().allMatch(AssertionOutcome::passed);
        return new Verdict(passed, score, outcomes);
    }

    private AssertionOutcome check(JsonNode root, AssertionSpec spec) {
        AssertionType type;
        try {
            type = spec.resolvedType();
        } catch (IllegalArgumentException e) {
            return fail(spec, "?", "-", e.getMessage());
        }
        JsonNode actual = resolve(root, spec.path());
        String actualText = describe(actual);
        String expectedText = describe(spec.expected());

        return switch (type) {
            case EQUALS -> judge(spec, type, expectedText, actualText,
                    spec.expected() != null && spec.expected().equals(actual));
            case EQUALS_IGNORE_CASE -> judge(spec, type, expectedText, actualText,
                    !isMissing(actual) && norm(actual).equalsIgnoreCase(norm(spec.expected())));
            case IN_SET -> judge(spec, type, expectedText, actualText, inSet(actual, spec.expected()));
            case NON_NULL -> judge(spec, type, "非空", actualText,
                    !isMissing(actual) && !norm(actual).isEmpty());
            case ABSENT -> judge(spec, type, "缺省或 null", actualText, isMissing(actual));
            case CONTAINS -> judge(spec, type, expectedText, actualText,
                    !isMissing(actual) && norm(actual).toLowerCase().contains(norm(spec.expected()).toLowerCase()));
            case NUMERIC_WITHIN -> numericWithin(spec, type, actual, actualText, expectedText);
        };
    }

    private AssertionOutcome numericWithin(AssertionSpec spec, AssertionType type,
                                           JsonNode actual, String actualText, String expectedText) {
        JsonNode exp = spec.expected();
        if (exp == null || !exp.hasNonNull("value")) {
            return fail(spec, expectedText, actualText, "NUMERIC_WITHIN 需要 {\"value\":x,\"tolerance\":y}");
        }
        if (isMissing(actual) || !actual.isNumber()) {
            return fail(spec, expectedText, actualText, "实际值不是数值");
        }
        double tolerance = exp.path("tolerance").asDouble(0);
        boolean ok = Math.abs(actual.asDouble() - exp.get("value").asDouble()) <= tolerance;
        return judge(spec, type, expectedText, actualText, ok);
    }

    private boolean inSet(JsonNode actual, JsonNode expected) {
        if (isMissing(actual) || expected == null || !expected.isArray()) {
            return false;
        }
        for (JsonNode candidate : expected) {
            if (norm(candidate).equalsIgnoreCase(norm(actual))) {
                return true;
            }
        }
        return false;
    }

    private AssertionOutcome judge(AssertionSpec spec, AssertionType type,
                                   String expected, String actual, boolean ok) {
        return new AssertionOutcome(type.name(), spec.path(), ok, spec.weightOrDefault(),
                expected, actual, ok ? null : "期望 " + expected + "，实际 " + actual);
    }

    private AssertionOutcome fail(AssertionSpec spec, String expected, String actual, String message) {
        return new AssertionOutcome(spec.type(), spec.path(), false, spec.weightOrDefault(),
                expected, actual, message);
    }

    /** 点号路径取值，支持 {@code a.b.c} 与数组下标 {@code items.0.name}。 */
    private JsonNode resolve(JsonNode root, String path) {
        if (root == null) {
            return null;
        }
        if (path == null || path.isBlank()) {
            return root;
        }
        JsonNode current = root;
        for (String segment : path.split("\\.")) {
            if (isMissing(current)) {
                return null;
            }
            if (current.isArray()) {
                int index;
                try {
                    index = Integer.parseInt(segment);
                } catch (NumberFormatException e) {
                    return null;
                }
                current = index >= 0 && index < current.size() ? current.get(index) : null;
            } else {
                current = current.get(segment);
            }
        }
        return current;
    }

    private boolean isMissing(JsonNode node) {
        return node == null || node.isNull() || node.isMissingNode();
    }

    private String norm(JsonNode node) {
        if (isMissing(node)) {
            return "";
        }
        return (node.isValueNode() ? node.asText() : node.toString()).trim();
    }

    private String describe(JsonNode node) {
        return isMissing(node) ? "<缺省>" : norm(node);
    }

    /**
     * 从期望值对象推导默认断言：每个标量字段一条 EQUALS_IGNORE_CASE。
     * <p>
     * 只覆盖标量。自由文本字段（如 bug 标题）不该用相等判定，必须经 {@code fuzzyFields} 降级或由用例显式配置，
     * 否则同一语义换个措辞就误判为退化。数组/对象字段同理，显式配置优于隐式误判。
     *
     * @param fuzzyFields 顶层字段名集合，命中者降级为 NON_NULL（权重 0.5）
     */
    public List<AssertionSpec> deriveFromExpected(JsonNode expected, Set<String> fuzzyFields) {
        List<AssertionSpec> specs = new ArrayList<>();
        if (expected == null || !expected.isObject()) {
            return specs;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = expected.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String name = entry.getKey();
            JsonNode value = entry.getValue();
            // 顺序不可调换：期望值为 null 时语义是「不该抽出来」，必须先于自由文本降级判定。
            // 若先降级，负样本里的 title:null 会变成 NON_NULL（要求该字段必须存在），
            // 与期望完全相反且永远无法满足——整批负样本会恒判负，看起来像模型全错。
            if (isMissing(value)) {
                specs.add(new AssertionSpec(AssertionType.ABSENT.name(), name, null, 1.0));
            } else if (fuzzyFields != null && fuzzyFields.contains(name)) {
                specs.add(new AssertionSpec(AssertionType.NON_NULL.name(), name, null, 0.5));
            } else if (value.isValueNode()) {
                specs.add(new AssertionSpec(AssertionType.EQUALS_IGNORE_CASE.name(), name, value, 1.0));
            }
        }
        return specs;
    }

    /** 判定结果。 */
    public record Verdict(boolean passed, double score, List<AssertionOutcome> outcomes) {
    }
}
