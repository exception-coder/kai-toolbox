package com.exceptioncoder.toolbox.browserrequest.api.dto;

import java.util.Map;

/** 触发回放：params 为 varName → 实际值 的映射。 */
public record ReplayRequest(
        Map<String, Object> params
) {
}
