package com.exceptioncoder.toolbox.common.auth;

import org.springframework.http.HttpStatus;

/**
 * 鉴权领域统一异常。携带稳定错误码 + HTTP 状态，由 GlobalExceptionHandler 转成 JSON；
 * JwtAuthFilter 在过滤器阶段（MVC 之前）则自行读取这两个字段写响应。
 */
public class AuthException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public AuthException(String code, HttpStatus status, String message) {
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

    public static AuthException badCredentials() {
        return new AuthException("AUTH_BAD_CREDENTIALS", HttpStatus.UNAUTHORIZED, "用户名或密码错误");
    }

    public static AuthException userDisabled() {
        return new AuthException("AUTH_USER_DISABLED", HttpStatus.FORBIDDEN, "用户已被停用");
    }

    public static AuthException tokenInvalid() {
        return new AuthException("AUTH_TOKEN_INVALID", HttpStatus.UNAUTHORIZED, "登录凭证无效或已过期");
    }

    public static AuthException refreshInvalid() {
        return new AuthException("AUTH_REFRESH_INVALID", HttpStatus.UNAUTHORIZED, "刷新令牌无效或已失效");
    }

    public static AuthException forbidden() {
        return new AuthException("AUTH_FORBIDDEN", HttpStatus.FORBIDDEN, "无访问权限");
    }

    public static AuthException userExists() {
        return new AuthException("AUTH_USER_EXISTS", HttpStatus.CONFLICT, "用户名已存在");
    }

    public static AuthException selfForbidden() {
        return new AuthException("AUTH_SELF_FORBIDDEN", HttpStatus.BAD_REQUEST, "不能对当前登录账号本身执行该操作");
    }
}
