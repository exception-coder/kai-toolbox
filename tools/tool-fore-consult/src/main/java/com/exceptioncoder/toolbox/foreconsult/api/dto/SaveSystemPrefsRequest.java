package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * 批量保存业务系统展示偏好的请求体（整表按项 upsert）。
 *
 * @param prefs 偏好项列表（可为空列表）
 */
public record SaveSystemPrefsRequest(
        List<Item> prefs
) {

    /**
     * 单个系统的展示偏好。
     *
     * @param systemName       系统原名（身份键，必填）
     * @param systemSourcePath 源码路径快照（可选）
     * @param alias            业务别名（可选，空/空白按无别名处理）
     * @param visible          是否显示（null 时按可见兜底）
     * @param sortOrder        排序权重（null 时按 0 兜底）
     */
    public record Item(
            @NotBlank String systemName,
            String systemSourcePath,
            String alias,
            Boolean visible,
            Integer sortOrder
    ) {
    }
}
