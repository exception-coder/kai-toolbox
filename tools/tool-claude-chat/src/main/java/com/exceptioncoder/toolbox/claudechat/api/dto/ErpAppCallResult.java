package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.Map;

/**
 * 本地 ERP 实例探测请求的结果。error 非空=失败（含被 host 白名单/生产域拦截、连接失败等），
 * 此时其余字段为默认值。
 *
 * @param status    HTTP 状态码（失败为 0）
 * @param finalUrl  实发的最终 URL（含 baseUrl 拼接结果）
 * @param elapsedMs 耗时（毫秒）
 * @param headers   关键响应头（Content-Type / Location 等）
 * @param body      响应体（已截断到上限，供 agent 断言）
 * @param truncated 响应体是否超上限被截断
 * @param error     错误信息（成功为 null）
 */
public record ErpAppCallResult(int status, String finalUrl, long elapsedMs,
                               Map<String, String> headers, String body, boolean truncated, String error) {

    public static ErpAppCallResult err(String msg) {
        return new ErpAppCallResult(0, null, 0, Map.of(), null, false, msg);
    }
}
