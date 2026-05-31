package com.exceptioncoder.toolbox.common.featureconfig.service;

import com.exceptioncoder.toolbox.common.featureconfig.FeatureConfigNotFoundException;
import com.exceptioncoder.toolbox.common.featureconfig.domain.FeatureConfig;
import com.exceptioncoder.toolbox.common.featureconfig.repository.FeatureConfigRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

@Service
public class FeatureConfigService {

    /** 与前端 FeatureManifest.id 保持一致：kebab-case，首字符字母 */
    private static final Pattern FEATURE_ID_PATTERN = Pattern.compile("^[a-z][a-z0-9-]{0,63}$");

    private final FeatureConfigRepository repository;
    private final ObjectMapper objectMapper;

    public FeatureConfigService(FeatureConfigRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public FeatureConfig findRequired(String featureId) {
        validateFeatureId(featureId);
        return repository.findById(featureId)
                .orElseThrow(() -> new FeatureConfigNotFoundException(featureId));
    }

    /**
     * upsert：value 必须是非 null 的 JSON 节点（object / array / primitive 都行，但 NullNode 视为非法）。
     * 由 controller 层把请求体 value 转成 JsonNode 后传入。
     */
    public FeatureConfig save(String featureId, JsonNode value) {
        validateFeatureId(featureId);
        if (value == null || value.isNull()) {
            throw new IllegalArgumentException("value must not be null");
        }
        String json;
        try {
            json = objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("value is not serializable to JSON: " + e.getOriginalMessage());
        }
        FeatureConfig cfg = FeatureConfig.builder()
                .featureId(featureId)
                .valueJson(json)
                .updatedAt(System.currentTimeMillis())
                .build();
        repository.upsert(cfg);
        return cfg;
    }

    /** 幂等：不存在也不报错 */
    public void delete(String featureId) {
        validateFeatureId(featureId);
        repository.deleteById(featureId);
    }

    private static void validateFeatureId(String featureId) {
        if (featureId == null || !FEATURE_ID_PATTERN.matcher(featureId).matches()) {
            throw new IllegalArgumentException(
                    "invalid featureId, must match ^[a-z][a-z0-9-]{0,63}$ : " + featureId);
        }
    }
}
