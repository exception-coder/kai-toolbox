package com.exceptioncoder.toolbox.common.resource;

import java.util.Map;

/** 资源动作请求，资源标识与凭据由服务端关系解析。 */
public record ResourceCall(String operation, String sql, String method, String path,
                           Map<String, Object> params, String bodyType) {
}
