package com.exceptioncoder.toolbox.browserrequest.api.dto;

import java.util.Map;

/**
 * 二选一：
 *   - 直接给 curl 文本（curl 字段非空），后端解析；
 *   - 或者给结构化的 method/url/headers/body。
 *
 * linkedSavedId：若提供，执行成功后把响应体（截断后）写到该 saved 的 lastResponseBody，
 * 这样后续编排时该 saved 始终带着「上次执行的实际响应」作参考样本。
 */
public record ExecuteRequestBody(String curl, String method, String url,
                                 Map<String, String> headers, String body,
                                 String linkedSavedId) {}
