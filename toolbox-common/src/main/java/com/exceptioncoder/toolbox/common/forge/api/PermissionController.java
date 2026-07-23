package com.exceptioncoder.toolbox.common.forge.api;

import com.exceptioncoder.toolbox.common.forge.annotation.RequiresPermission;
import com.exceptioncoder.toolbox.common.forge.api.dto.PermissionView;
import com.exceptioncoder.toolbox.common.forge.service.PermissionRegistryService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 权限码只读接口（FR-PERM）。权限码由启动同步维护，无写接口。供角色勾选树使用。
 */
@RestController
@RequestMapping("/api/forge/permissions")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class PermissionController {

    private final PermissionRegistryService permissionRegistryService;

    public PermissionController(PermissionRegistryService permissionRegistryService) {
        this.permissionRegistryService = permissionRegistryService;
    }

    @GetMapping
    @RequiresPermission("forge:role:menu")
    public List<PermissionView> list() {
        return permissionRegistryService.list();
    }
}
