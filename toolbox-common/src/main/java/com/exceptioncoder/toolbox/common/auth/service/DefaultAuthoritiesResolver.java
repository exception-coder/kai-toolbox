package com.exceptioncoder.toolbox.common.auth.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 兜底授权解析：Forge 未装配时沿用 auth_user.roles，无权限码、非超管。
 * Forge 提供自己的 {@link AuthoritiesResolver} 实现时，本兜底因 {@link ConditionalOnMissingBean} 让位。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
@ConditionalOnMissingBean(AuthoritiesResolver.class)
public class DefaultAuthoritiesResolver implements AuthoritiesResolver {

    @Override
    public AuthAuthorities resolve(long userId, List<String> fallbackRoles) {
        return new AuthAuthorities(
                fallbackRoles == null ? List.of() : fallbackRoles,
                List.of(),
                false);
    }
}
