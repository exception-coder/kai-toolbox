package com.exceptioncoder.toolbox.common.auth.web;

import com.exceptioncoder.toolbox.common.auth.annotation.SoftGuard;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

/**
 * 软鉴权拦截器：
 * <ul>
 *   <li>handler 标了 {@link SoftGuard}：按其角色 + ADMIN + READONLY(只读) 判定；</li>
 *   <li>否则若请求路径命中 {@code toolbox.auth.admin-only-patterns}：按 ADMIN-only 判定。</li>
 * </ul>
 * 未授权时按返回类型写空响应并短路（return false）——写操作 no-op，且不返回 401/403。
 */
public class SoftGuardInterceptor implements HandlerInterceptor {

    private static final String ADMIN = "ADMIN";
    /** 全局只读角色：在 @SoftGuard 模块仅安全方法(GET/HEAD/OPTIONS)放行，写方法按未授权处理。 */
    private static final String READONLY = "READONLY";

    private final AuthProperties props;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    public SoftGuardInterceptor(AuthProperties props) {
        this.props = props;
    }

    private static boolean isSafeMethod(String method) {
        return "GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }

        SoftGuard onMethod = method.getMethodAnnotation(SoftGuard.class);
        final SoftGuard guard = onMethod != null ? onMethod : method.getBeanType().getAnnotation(SoftGuard.class);

        if (guard != null) {
            final boolean safe = isSafeMethod(request.getMethod());
            boolean authorized = AuthContext.current()
                    .map(p -> p.hasAnyRole(ADMIN)
                            || p.hasAnyRole(guard.value())
                            || (safe && guard.allowReadonly() && p.hasAnyRole(READONLY)))
                    .orElse(false);
            if (authorized) {
                return true;
            }
            EmptyResponses.write(response, method);
            return false;
        }

        // 配置驱动 ADMIN-only：命中 admin-only-patterns 的路径，非 ADMIN 一律空响应。
        if (matchesAdminOnly(request.getRequestURI())) {
            boolean isAdmin = AuthContext.current().map(p -> p.hasAnyRole(ADMIN)).orElse(false);
            if (isAdmin) {
                return true;
            }
            EmptyResponses.write(response, method);
            return false;
        }
        return true;
    }

    private boolean matchesAdminOnly(String uri) {
        for (String pattern : props.getAdminOnlyPatterns()) {
            if (pathMatcher.match(pattern, uri)) {
                return true;
            }
        }
        return false;
    }
}
