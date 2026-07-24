package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 需求拆分的一个子项：既用作 {@code POST /sessions/{id}/split} 的响应元素（AI 建议的拆分结果），
 * 也用作 {@code POST /sessions/{id}/split/adopt} 请求体里的元素（用户确认/编辑后要采纳的子需求）——
 * 两个方向字段完全同构，不用拆两个类。
 *
 * @param title    子需求标题
 * @param rawInput 子需求描述（已重新组织成完整、自洽的描述，不依赖原需求上下文）
 * @param module   建议归属的模块（可选，AI 判断不出来时为空，采纳时兜底继承父需求的 module）
 */
public record SplitItemView(
        @NotBlank String title,
        @NotBlank String rawInput,
        String module
) {
}
