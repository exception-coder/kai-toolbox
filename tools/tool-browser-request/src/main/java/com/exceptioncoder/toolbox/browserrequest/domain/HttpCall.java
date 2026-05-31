package com.exceptioncoder.toolbox.browserrequest.domain;

import com.exceptioncoder.toolbox.browserrequest.domain.enums.ResourceType;

import java.util.Map;

/**
 * 一条录制下来的 HTTP 调用。headers 字段在落库时序列化为 JSON 字符串。
 *
 * 响应体三档处理（truncateAt 由前端每次开录选定，maxBytes 见 BrowserRequestProperties）：
 *   - body ≤ truncateAt → 全存
 *   - body 在 truncateAt..maxBytes 之间 → 截断到 truncateAt + responseTruncated=true
 *   - body > maxBytes（content-length 已告知） → responseBody = null
 *
 * sensitive=true 时请求/响应 body 一律不入库（即使大小未超）。
 */
public record HttpCall(
        String id,
        String recordingId,
        int seq,
        String method,
        String url,
        ResourceType resourceType,
        Map<String, String> requestHeaders,
        String requestBody,
        Integer status,
        Map<String, String> responseHeaders,
        String responseBody,
        boolean responseTruncated,
        boolean sensitive,
        long startedAt,
        Integer elapsedMs,
        String initiator
) {
}
