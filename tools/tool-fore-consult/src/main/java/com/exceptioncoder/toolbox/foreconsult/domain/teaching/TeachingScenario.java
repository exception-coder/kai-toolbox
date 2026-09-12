package com.exceptioncoder.toolbox.foreconsult.domain.teaching;

import java.util.List;

/** 固定教学样本；脚本使用提议字段，评分使用独立的期望结果。 */
public record TeachingScenario(
        /** 样本 ID。 */ String id,
        /** 名称。 */ String title,
        /** 输入文本。 */ String input,
        /** 提议款号。 */ String style,
        /** 提议数量。 */ Integer quantity,
        /** 修改时的初始草稿。 */ OrderDraft previous,
        /** 期望状态。 */ String expectedStatus,
        /** 期望 SKU。 */ String expectedSku,
        /** 期望数量。 */ Integer expectedQuantity) {
    public static List<TeachingScenario> all() {
        return List.of(
                new TeachingScenario("complete", "完整订单", "帮我订 A123，100 件", "A123", 100,
                        null, "READY", "A123", 100),
                new TeachingScenario("ambiguous", "款号歧义", "订 B200，50 件", "B200", 50,
                        null, "NEEDS_CLARIFICATION", null, 50),
                new TeachingScenario("missing", "缺少数量", "我想订 A123", "A123", null,
                        null, "NEEDS_CLARIFICATION", "A123", null),
                new TeachingScenario("invalid", "非法数量", "订 A123，-2 件", "A123", -2,
                        null, "INVALID", "A123", -2),
                new TeachingScenario("modify", "修改数量", "改成 120 件", "A123", 120,
                        new OrderDraft(TeachingConfig.CONTRACT_VERSION, "A123", "A123", 100, "READY", List.of()),
                        "READY", "A123", 120));
    }

    public static TeachingScenario find(String id) {
        return all().stream().filter(item -> item.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("请选择有效教学场景"));
    }
}
