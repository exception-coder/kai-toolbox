package com.exceptioncoder.toolbox.common.forge.config;

import com.exceptioncoder.toolbox.common.forge.model.PermissionDef;
import com.exceptioncoder.toolbox.common.forge.service.PermissionContributor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Forge 管理后台自身的权限码声明。菜单 + 关键按钮，供角色勾选与接口 @RequiresPermission 引用。
 * 与后端接口所需权限码、前端菜单/按钮引用的 code 保持同名（FR-PERM-04）。
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class ForgeOwnPermissions implements PermissionContributor {

    private static final String M_DEPT = "forge-department";
    private static final String M_ROLE = "forge-role";
    private static final String M_USER = "forge-user";

    @Override
    public List<PermissionDef> permissions() {
        return List.of(
                // 部门管理
                PermissionDef.menu("forge:dept:menu", "部门管理", M_DEPT, 10),
                PermissionDef.button("forge:dept:btn:edit", "部门新增/编辑", M_DEPT, "forge:dept:menu", 11),
                PermissionDef.button("forge:dept:btn:delete", "部门删除", M_DEPT, "forge:dept:menu", 12),
                // 角色管理
                PermissionDef.menu("forge:role:menu", "角色管理", M_ROLE, 20),
                PermissionDef.button("forge:role:btn:edit", "角色新增/编辑", M_ROLE, "forge:role:menu", 21),
                PermissionDef.button("forge:role:btn:delete", "角色删除", M_ROLE, "forge:role:menu", 22),
                PermissionDef.button("forge:role:btn:bind", "角色绑定权限", M_ROLE, "forge:role:menu", 23),
                // 用户授权（扩展账号管理页）
                PermissionDef.menu("forge:user:menu", "用户授权", M_USER, 30),
                PermissionDef.button("forge:user:btn:assign", "分配角色/部门", M_USER, "forge:user:menu", 31)
        );
    }
}
