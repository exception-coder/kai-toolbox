package com.exceptioncoder.toolbox.common.auth.web;

import java.util.Optional;

/**
 * 当前线程的已认证用户持有者。JwtAuthFilter 在请求进入时 set，请求结束 finally 中 clear。
 *
 * <p>虚拟线程已开启（spring.threads.virtual.enabled=true），每请求一线程不复用，
 * 但仍必须 clear——否则线程池化场景或异步派发会串号。
 */
public final class AuthContext {

    private static final ThreadLocal<AuthPrincipal> CURRENT = new ThreadLocal<>();

    private AuthContext() {
    }

    public static void set(AuthPrincipal principal) {
        CURRENT.set(principal);
    }

    public static Optional<AuthPrincipal> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static boolean isAuthenticated() {
        return CURRENT.get() != null;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
