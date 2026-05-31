package com.exceptioncoder.toolbox.common.featureconfig.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 通用 feature 配置领域对象。
 * value 以 JSON 字符串落库，由调用方各自定义结构。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FeatureConfig {
    private String featureId;
    private String valueJson;
    private long updatedAt;
}
