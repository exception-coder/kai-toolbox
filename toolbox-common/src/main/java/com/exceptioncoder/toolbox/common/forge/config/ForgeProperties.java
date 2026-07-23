package com.exceptioncoder.toolbox.common.forge.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Forge 权限体系配置，前缀 {@code toolbox.forge}。整套 forge 能力挂在 {@code toolbox.auth.enabled}
 * 之下，本配置只承载 forge 自身的可调参数。
 */
@Data
@ConfigurationProperties(prefix = "toolbox.forge")
public class ForgeProperties {

    /**
     * 超级管理员角色 code。持有该角色的用户 bypass 全部权限码校验。
     * 缺省 {@code ADMIN} 以复用既有 {@code @RequireRole("ADMIN")} 语义，实现平滑过渡。
     */
    private String superAdminRoleCode = "ADMIN";

    /** 超级管理员角色显示名，仅首启动建角色时使用。 */
    private String superAdminRoleName = "超级管理员";
}
