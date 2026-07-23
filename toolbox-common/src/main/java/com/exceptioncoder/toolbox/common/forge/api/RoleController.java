package com.exceptioncoder.toolbox.common.forge.api;

import com.exceptioncoder.toolbox.common.forge.annotation.RequiresPermission;
import com.exceptioncoder.toolbox.common.forge.api.dto.RoleDetailView;
import com.exceptioncoder.toolbox.common.forge.api.dto.RolePermissionBindRequest;
import com.exceptioncoder.toolbox.common.forge.api.dto.RoleSaveRequest;
import com.exceptioncoder.toolbox.common.forge.api.dto.RoleView;
import com.exceptioncoder.toolbox.common.forge.service.RoleService;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 角色管理接口（FR-ROLE）。业务逻辑全部下沉 RoleService。
 */
@RestController
@RequestMapping("/api/forge/roles")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class RoleController {

    private final RoleService roleService;

    public RoleController(RoleService roleService) {
        this.roleService = roleService;
    }

    @GetMapping
    @RequiresPermission("forge:role:menu")
    public List<RoleView> list() {
        return roleService.list();
    }

    @GetMapping("/{id}")
    @RequiresPermission("forge:role:menu")
    public RoleDetailView detail(@PathVariable long id) {
        return roleService.detail(id);
    }

    @PostMapping
    @RequiresPermission("forge:role:btn:edit")
    public RoleView create(@Valid @RequestBody RoleSaveRequest req) {
        return roleService.create(req);
    }

    @PutMapping("/{id}")
    @RequiresPermission("forge:role:btn:edit")
    public RoleView update(@PathVariable long id, @Valid @RequestBody RoleSaveRequest req) {
        return roleService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("forge:role:btn:delete")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        roleService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/permissions")
    @RequiresPermission("forge:role:btn:bind")
    public RoleDetailView bindPermissions(@PathVariable long id, @RequestBody RolePermissionBindRequest req) {
        return roleService.bindPermissions(id, req.permissionIds());
    }
}
