package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.auth.service.AuthAuthorities;
import com.exceptioncoder.toolbox.common.auth.service.AuthoritiesResolver;
import com.exceptioncoder.toolbox.common.forge.config.ForgeProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Forge 对 auth {@link AuthoritiesResolver} 端口的实现（适配器）：登录/刷新时把角色与权限码
 * 从 forge_* 表解析成授权快照写入 JWT。{@code @Primary} 保证装配 Forge 时覆盖 auth 的兜底解析。
 *
 * <p>迁移期兜底：用户在 forge_user_role 无任何启用角色时，回退到 auth_user.roles，
 * 避免既有账号（尤其种子管理员）在 forge 角色尚未绑定时被锁死。</p>
 */
@Service
@Primary
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class ForgeAuthoritiesResolver implements AuthoritiesResolver {

    private final UserAuthorizationService authorizationService;
    private final ForgeProperties props;

    public ForgeAuthoritiesResolver(UserAuthorizationService authorizationService, ForgeProperties props) {
        this.authorizationService = authorizationService;
        this.props = props;
    }

    @Override
    public AuthAuthorities resolve(long userId, List<String> fallbackRoles) {
        List<String> forgeRoles = authorizationService.resolveRoleCodes(userId);
        List<String> effectiveRoles = forgeRoles.isEmpty()
                ? (fallbackRoles == null ? List.of() : fallbackRoles)
                : forgeRoles;
        List<String> permissionCodes = authorizationService.resolvePermissionCodes(userId);
        boolean superAdmin = effectiveRoles.contains(props.getSuperAdminRoleCode());
        return new AuthAuthorities(effectiveRoles, permissionCodes, superAdmin);
    }
}
