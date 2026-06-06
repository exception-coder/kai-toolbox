package com.exceptioncoder.toolbox.common.dynamicconfig;

import org.springframework.http.HttpStatus;

/**
 * 配置中心统一异常，携带稳定错误码 + HTTP 状态，由 GlobalExceptionHandler 转 JSON。
 */
public class DynamicConfigException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public DynamicConfigException(String code, HttpStatus status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public static DynamicConfigException blockNotFound(String id) {
        return new DynamicConfigException("CONFIG_BLOCK_NOT_FOUND", HttpStatus.NOT_FOUND, "配置块不存在: " + id);
    }

    public static DynamicConfigException keyNotInBlock(String key, String prefix) {
        return new DynamicConfigException("CONFIG_KEY_NOT_IN_BLOCK", HttpStatus.BAD_REQUEST,
                "配置项 [" + key + "] 不属于配置块 [" + prefix + "]");
    }

    public static DynamicConfigException valueInvalid(String message) {
        return new DynamicConfigException("CONFIG_VALUE_INVALID", HttpStatus.BAD_REQUEST, message);
    }
}
