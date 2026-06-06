package com.exceptioncoder.toolbox.common.auth.web;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 方法级授权拦截器。读取 handler 上的 {@link RequireAuth} / {@link RequireRole}，结合 AuthContext 判定。
 * 抛出的 AuthException 由 GlobalExceptionHandler 统一转 JSON。
 */
public class RequireAuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }

        RequireRole requireRole = findAnnotation(method, RequireRole.class);
        RequireAuth requireAuth = findAnnotation(method, RequireAuth.class);
        if (requireRole == null && requireAuth == null) {
            return true;
        }

        AuthPrincipal principal = AuthContext.current().orElseThrow(AuthException::tokenInvalid);

        if (requireRole != null && !principal.hasAnyRole(requireRole.value())) {
            throw AuthException.forbidden();
        }
        return true;
    }

    private <A extends java.lang.annotation.Annotation> A findAnnotation(HandlerMethod method, Class<A> type) {
        A onMethod = method.getMethodAnnotation(type);
        return onMethod != null ? onMethod : method.getBeanType().getAnnotation(type);
    }
}
