package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.forge.repository.RolePermissionRepository;
import com.exceptioncoder.toolbox.common.forge.repository.UserRoleRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 用户授权解析（原子能力）：把 userId 解析成角色 code 与权限码并集。
 * 被登录签发（ForgeAuthoritiesResolver）、GET /api/forge/me/permissions 共同复用。
 * 鉴权链：用户 →(user_role)→ 启用角色 →(role_permission)→ 存活权限码。部门不入链。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class UserAuthorizationService {

    private final UserRoleRepository userRoleRepository;
    private final RolePermissionRepository rolePermissionRepository;

    public UserAuthorizationService(UserRoleRepository userRoleRepository,
                                    RolePermissionRepository rolePermissionRepository) {
        this.userRoleRepository = userRoleRepository;
        this.rolePermissionRepository = rolePermissionRepository;
    }

    /** 用户已绑、启用角色的 code 集合，作为 JWT roles 权威源。 */
    public List<String> resolveRoleCodes(long userId) {
        return userRoleRepository.findEnabledRoleCodesByUser(userId);
    }

    /** 用户经启用角色可见的存活权限码并集。 */
    public List<String> resolvePermissionCodes(long userId) {
        return rolePermissionRepository.findActivePermissionCodesByUser(userId);
    }
}
