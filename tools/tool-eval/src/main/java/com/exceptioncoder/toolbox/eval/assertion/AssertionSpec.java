package com.exceptioncoder.toolbox.eval.assertion;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * L2 断言配置。类型库是通用的、可复用的；用哪几条、期望值是什么由具体用例（场景）决定。
 *
 * @param type     断言类型，见 {@link AssertionType}
 * @param path     取值路径，点号分隔，如 {@code bug.severity}
 * @param expected 期望值，语义随 type 变化
 * @param weight   权重，用于算加权分；为空按 1.0
 */
public record AssertionSpec(
        String type,
        String path,
        JsonNode expected,
        Double weight
) {
    public double weightOrDefault() {
        return weight == null || weight <= 0 ? 1.0 : weight;
    }

    public AssertionType resolvedType() {
        return AssertionType.from(type);
    }
}
