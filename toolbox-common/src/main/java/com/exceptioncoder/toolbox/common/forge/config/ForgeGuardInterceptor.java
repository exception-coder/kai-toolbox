package com.exceptioncoder.toolbox.common.forge.config;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.forge.annotation.RequiresPermission;
import com.exceptioncoder.toolbox.common.forge.service.ForgeGuardService;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Forge 硬鉴权拦截器：读取 handler 上的 {@link RequiresPermission}，结合 AuthContext 校验权限码。
 * 缺登录抛 UnauthorizedException(401)、缺码抛 ForbiddenException(403)，由 @ResponseStatus 统一转 JSON。
 *
 * <p>只在初始 REQUEST 派发上鉴权——异步再派发（SSE/HLS 分片写完后的 ASYNC dispatch）、ERROR/FORWARD
 * 等二次派发一律放行，避免破坏流式响应收尾（沿用 SoftGuardInterceptor 的同款安全约束）。</p>
 */
public class ForgeGuardInterceptor implements HandlerInterceptor {

    private final ForgeGuardService guard;

    public ForgeGuardInterceptor(ForgeGuardService guard) {
        this.guard = guard;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (request.getDispatcherType() != DispatcherType.REQUEST) {
            return true;
        }
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }
        RequiresPermission ann = method.getMethodAnnotation(RequiresPermission.class);
        if (ann == null) {
            ann = method.getBeanType().getAnnotation(RequiresPermission.class);
        }
        if (ann == null) {
            return true;
        }
        guard.authorize(AuthContext.current().orElse(null), ann.value());
        return true;
    }
}
