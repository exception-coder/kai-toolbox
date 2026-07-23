package com.exceptioncoder.toolbox.common.auth.web;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 配置驱动的 ADMIN-only 硬鉴权：命中 {@code toolbox.auth.admin-only-patterns} 的路径，
 * 未登录抛 401、非 ADMIN 抛 403（取代原 SoftGuard 的静默空响应语义）。
 *
 * <p>只在初始 REQUEST 派发上鉴权——异步再派发（SSE/HLS 分片收尾）、ERROR/FORWARD 等二次派发一律放行，
 * 避免破坏流式响应收尾。</p>
 */
public class AdminOnlyInterceptor implements HandlerInterceptor {

    private static final String ADMIN = "ADMIN";

    private final AuthProperties props;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    public AdminOnlyInterceptor(AuthProperties props) {
        this.props = props;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (request.getDispatcherType() != DispatcherType.REQUEST) {
            return true;
        }
        if (!matchesAdminOnly(request.getRequestURI())) {
            return true;
        }
        AuthPrincipal principal = AuthContext.current().orElseThrow(AuthException::tokenInvalid);
        if (!principal.hasAnyRole(ADMIN)) {
            throw AuthException.forbidden();
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
