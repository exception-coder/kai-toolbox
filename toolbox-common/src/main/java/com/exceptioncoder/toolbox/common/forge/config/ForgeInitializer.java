package com.exceptioncoder.toolbox.common.forge.config;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import com.exceptioncoder.toolbox.common.forge.model.DataScopeType;
import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import com.exceptioncoder.toolbox.common.forge.model.Role;
import com.exceptioncoder.toolbox.common.forge.repository.RoleRepository;
import com.exceptioncoder.toolbox.common.forge.repository.UserRoleRepository;
import com.exceptioncoder.toolbox.common.forge.service.PermissionRegistryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Forge 首启动初始化。应用就绪后（在 auth 建种子管理员之后，见 @Order）执行：
 * <ol>
 *   <li>同步权限码（PermissionRegistryService）；</li>
 *   <li>权限表为空时建 builtin 超管角色，并把既有持有 ADMIN 的 auth 用户绑定过去（迁移种子管理员）。</li>
 * </ol>
 * LOWEST_PRECEDENCE 保证晚于 auth 的 bootstrap 事件监听。
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class ForgeInitializer {

    private static final Logger log = LoggerFactory.getLogger(ForgeInitializer.class);
    private static final String AUTH_ADMIN_ROLE = "ADMIN";

    private final PermissionRegistryService permissionRegistryService;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final AuthUserRepository authUserRepository;
    private final ForgeProperties props;

    public ForgeInitializer(PermissionRegistryService permissionRegistryService,
                            RoleRepository roleRepository,
                            UserRoleRepository userRoleRepository,
                            AuthUserRepository authUserRepository,
                            ForgeProperties props) {
        this.permissionRegistryService = permissionRegistryService;
        this.roleRepository = roleRepository;
        this.userRoleRepository = userRoleRepository;
        this.authUserRepository = authUserRepository;
        this.props = props;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.LOWEST_PRECEDENCE)
    public void init() {
        permissionRegistryService.syncOnStartup();
        seedSuperAdminIfEmpty();
    }

    /**
     * 权限角色表为空时建超管角色并绑定既有管理员。以 forge_role 是否为空作为「首次部署」判据。
     */
    private void seedSuperAdminIfEmpty() {
        if (roleRepository.count() > 0) {
            return;
        }
        long now = System.currentTimeMillis();
        long roleId = roleRepository.insert(Role.builder()
                .name(props.getSuperAdminRoleName())
                .code(props.getSuperAdminRoleCode())
                .description("系统内置超级管理员，bypass 全部权限码校验")
                .builtin(true)
                .dataScopeType(DataScopeType.ALL)
                .status(EntityStatus.ENABLED)
                .createdAt(now)
                .updatedAt(now)
                .build());

        List<AuthUser> admins = authUserRepository.findAll().stream()
                .filter(u -> u.getRoles() != null && u.getRoles().contains(AUTH_ADMIN_ROLE))
                .toList();
        for (AuthUser admin : admins) {
            if (!userRoleRepository.exists(admin.getId(), roleId)) {
                userRoleRepository.insert(admin.getId(), roleId);
            }
        }
        log.info("Forge 首启动：已建内置超管角色 [{}]，绑定 {} 个既有管理员账号",
                props.getSuperAdminRoleCode(), admins.size());
    }
}
