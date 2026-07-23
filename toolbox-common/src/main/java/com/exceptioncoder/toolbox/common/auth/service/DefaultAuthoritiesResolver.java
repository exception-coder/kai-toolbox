package com.exceptioncoder.toolbox.common.auth.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 兜底授权解析：Forge 未装配时沿用 auth_user.roles，无权限码、非超管。
 * Forge 装配时提供 {@code @Primary} 的实现覆盖本兜底（本类保留为普通 bean，注入以 @Primary 者优先）。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class DefaultAuthoritiesResolver implements AuthoritiesResolver {

    @Override
    public AuthAuthorities resolve(long userId, List<String> fallbackRoles) {
        return new AuthAuthorities(
                fallbackRoles == null ? List.of() : fallbackRoles,
                List.of(),
                false);
    }
}
