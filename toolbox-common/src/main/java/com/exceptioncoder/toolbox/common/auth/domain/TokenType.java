package com.exceptioncoder.toolbox.common.auth.domain;

/**
 * token 用途。写入 JWT 的 {@code type} claim，防止 refresh token 被当 access 使用（反之亦然）。
 */
public enum TokenType {
    ACCESS,
    REFRESH
}
