package com.exceptioncoder.toolbox.common.featureconfig.api.dto;

import com.exceptioncoder.toolbox.common.featureconfig.domain.FeatureConfig;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * GET / PUT 返回结构。value 直接以 JsonNode 输出，避免被二次字符串化。
 */
public record FeatureConfigView(String featureId, JsonNode value, long updatedAt) {

    public static FeatureConfigView from(FeatureConfig cfg, ObjectMapper objectMapper) {
        JsonNode value;
        try {
            value = objectMapper.readTree(cfg.getValueJson());
        } catch (JsonProcessingException e) {
            // 入库前 Service 已经 writeValueAsString 过，这里理论不会到；兜底抛 IllegalStateException 让 500 暴露脏数据
            throw new IllegalStateException(
                    "feature_config.value_json corrupted for featureId=" + cfg.getFeatureId(), e);
        }
        return new FeatureConfigView(cfg.getFeatureId(), value, cfg.getUpdatedAt());
    }
}
