package com.exceptioncoder.toolbox.browserrequest.domain;

import java.util.Map;

/**
 * Step 没有引用录制中的 call 时（adhoc 模式），直接保存请求模板。
 * 录制被删后 step 也会被「降级」为 adhoc：把原 call 的 method/url/headers/body 写进来。
 *
 * responseSample：保存创建时的响应体快照，用于编辑 task 时回放响应树供用户挑变量。
 * 不参与回放执行（回放是真发请求），仅是编辑器的 UX 助手。可空（adhoc 手写或老数据）。
 */
public record AdhocRequest(
        String method,
        String url,
        Map<String, String> headers,
        String body,
        String responseSample
) {
}
