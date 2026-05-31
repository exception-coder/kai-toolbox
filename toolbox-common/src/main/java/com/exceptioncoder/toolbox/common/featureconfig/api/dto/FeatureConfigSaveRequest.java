package com.exceptioncoder.toolbox.common.featureconfig.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;

/**
 * PUT /api/feature-configs/{featureId} 请求体。
 * value 是任意 JSON 内容（object/array/primitive），由调用方各自定义；后端不校验内部 schema。
 * 注：@NotNull 只能防 JSON 中 value 字段缺失；JSON null 值会被反序列化为 NullNode，由 Service 层显式拦截。
 */
public record FeatureConfigSaveRequest(@NotNull JsonNode value) {
}
