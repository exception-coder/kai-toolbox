package com.exceptioncoder.toolbox.common.auth.service;

import java.util.List;

/**
 * 授权解析端口。签发 token 时由 TokenService 调用，把 userId 解析成角色 + 权限码快照。
 *
 * <p>auth 模块提供 {@link DefaultAuthoritiesResolver} 兜底（沿用 auth_user.roles、无权限码），
 * Forge 权限体系提供覆盖实现（角色/权限码来自 forge_* 表）。这样 auth 不静态依赖 Forge，
 * 关闭 Forge 时鉴权仍可独立工作（Clean Architecture 端口-适配器）。</p>
 */
public interface AuthoritiesResolver {

    /**
     * @param userId        目标用户
     * @param fallbackRoles 该用户在 auth_user 中的原始角色，Forge 无绑定时兜底用，避免锁死
     * @return 授权快照
     */
    AuthAuthorities resolve(long userId, List<String> fallbackRoles);
}
