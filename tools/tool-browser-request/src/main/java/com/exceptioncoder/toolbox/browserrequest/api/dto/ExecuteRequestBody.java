package com.exceptioncoder.toolbox.browserrequest.api.dto;

import java.util.Map;

/**
 * 二选一：
 *   - 直接给 curl 文本（curl 字段非空），后端解析；
 *   - 或者给结构化的 method/url/headers/body。
 */
public record ExecuteRequestBody(String curl, String method, String url,
                                 Map<String, String> headers, String body) {}
