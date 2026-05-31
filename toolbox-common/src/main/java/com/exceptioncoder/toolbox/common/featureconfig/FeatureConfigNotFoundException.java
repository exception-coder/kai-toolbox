package com.exceptioncoder.toolbox.common.featureconfig;

/**
 * 调用方请求的 featureId 在 feature_config 表中没有记录。
 * 由 GlobalExceptionHandler 映射为 HTTP 404。
 */
public class FeatureConfigNotFoundException extends RuntimeException {
    public FeatureConfigNotFoundException(String featureId) {
        super("feature config not found: " + featureId);
    }
}
