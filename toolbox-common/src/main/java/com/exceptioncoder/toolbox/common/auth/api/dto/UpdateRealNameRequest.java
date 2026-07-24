package com.exceptioncoder.toolbox.common.auth.api.dto;

/** 修改真实姓名请求。realName 为空/空白表示清空。 */
public record UpdateRealNameRequest(
        String realName
) {
}
