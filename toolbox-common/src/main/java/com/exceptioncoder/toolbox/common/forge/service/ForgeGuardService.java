package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.forge.config.ForgeProperties;
import com.exceptioncoder.toolbox.common.forge.exception.ForbiddenException;
import com.exceptioncoder.toolbox.common.forge.exception.UnauthorizedException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/**
 * 权限码校验（横切原子能力）：未登录 401、超管 bypass、命中任一所需权限码放行、否则 403。
 * 被 ForgeGuardInterceptor 调用；也可在 service 层显式调用做更细粒度校验。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class ForgeGuardService {

    private final ForgeProperties props;

    public ForgeGuardService(ForgeProperties props) {
        this.props = props;
    }

    /**
     * @param principal    当前已认证主体，null 表示未登录
     * @param requiredAnyOf 所需权限码，持有任一即放行；为空表示仅需登录
     */
    public void authorize(AuthPrincipal principal, String... requiredAnyOf) {
        if (principal == null) {
            throw new UnauthorizedException();
        }
        if (isSuperAdmin(principal)) {
            return;
        }
        if (requiredAnyOf == null || requiredAnyOf.length == 0) {
            return;
        }
        for (String code : requiredAnyOf) {
            if (principal.hasPermission(code)) {
                return;
            }
        }
        throw ForbiddenException.missingPermission(String.join("/", requiredAnyOf));
    }

    /** 是否超级管理员（持有 superAdminRoleCode 角色）。 */
    public boolean isSuperAdmin(AuthPrincipal principal) {
        return principal != null && principal.hasAnyRole(props.getSuperAdminRoleCode());
    }
}
