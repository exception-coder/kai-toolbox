package com.exceptioncoder.toolbox.foreconsult.domain.teaching;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 教学 ERP 固定数据与草稿约束，不代表真实 ERP 业务规则。 */
public final class TeachingOrderRules {
    private static final Map<String, List<String>> CATALOG = Map.of(
            "A123", List.of("A123"),
            "B200", List.of("B200-BLUE", "B200-WHITE"),
            "B200-BLUE", List.of("B200-BLUE"),
            "B200-WHITE", List.of("B200-WHITE"));

    private TeachingOrderRules() {
    }

    public static List<String> lookup(String styleCode) {
        String code = normalize(styleCode);
        if (code == null) {
            throw new IllegalArgumentException("请提供款号");
        }
        return CATALOG.getOrDefault(code, List.of());
    }

    public static OrderDraft validate(String styleCode, Integer quantity, int maximum) {
        String code = normalize(styleCode);
        List<String> issues = new ArrayList<>();
        List<String> matches = code == null ? List.of() : lookup(code);
        if (code == null) {
            issues.add("请补充款号");
        } else if (matches.isEmpty()) {
            issues.add("模拟 ERP 无此款号，请核对");
        } else if (matches.size() > 1) {
            issues.add("款号有多个候选：" + String.join("、", matches) + "，请明确颜色");
        }
        if (quantity == null) {
            issues.add("请补充数量");
        } else if (quantity < 1 || quantity > maximum) {
            issues.add("数量须为 1 至 " + maximum);
        }
        boolean invalid = quantity != null && (quantity < 1 || quantity > maximum);
        String status = invalid ? "INVALID" : issues.isEmpty() ? "READY" : "NEEDS_CLARIFICATION";
        return new OrderDraft(TeachingConfig.CONTRACT_VERSION, code,
                matches.size() == 1 ? matches.getFirst() : null, quantity, status, List.copyOf(issues));
    }

    private static String normalize(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        if (code.length() > 40) {
            throw new IllegalArgumentException("款号不能超过 40 字符");
        }
        return code.trim().toUpperCase(Locale.ROOT);
    }
}
