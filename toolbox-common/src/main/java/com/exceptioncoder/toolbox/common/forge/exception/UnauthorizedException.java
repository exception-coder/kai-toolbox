package com.exceptioncoder.toolbox.common.forge.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * 未登录 / 会话失效。由 ForgeGuardInterceptor 在缺少已认证主体时抛出，映射 401。
 * 取代 SoftGuard 的静默空响应语义（FR-GUARD-02）。
 */
@ResponseStatus(HttpStatus.UNAUTHORIZED)
public class UnauthorizedException extends RuntimeException {
    public UnauthorizedException() {
        super("未登录或登录已失效");
    }
}
