package com.exceptioncoder.toolbox.common.forge.api;

import com.exceptioncoder.toolbox.common.forge.annotation.RequiresPermission;
import com.exceptioncoder.toolbox.common.forge.api.dto.AssignRolesRequest;
import com.exceptioncoder.toolbox.common.forge.api.dto.SetDepartmentRequest;
import com.exceptioncoder.toolbox.common.forge.api.dto.UserGrantView;
import com.exceptioncoder.toolbox.common.forge.service.UserGrantService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 用户授权归属接口（FR-UR，扩展账号管理页）。业务逻辑下沉 UserGrantService。
 */
@RestController
@RequestMapping("/api/forge/users")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class UserRoleController {

    private final UserGrantService userGrantService;

    public UserRoleController(UserGrantService userGrantService) {
        this.userGrantService = userGrantService;
    }

    @GetMapping("/grants")
    @RequiresPermission("forge:user:menu")
    public List<UserGrantView> allGrants() {
        return userGrantService.allGrants();
    }

    @GetMapping("/{userId}/roles")
    @RequiresPermission("forge:user:menu")
    public UserGrantView view(@PathVariable long userId) {
        return userGrantService.view(userId);
    }

    @PutMapping("/{userId}/roles")
    @RequiresPermission("forge:user:btn:assign")
    public UserGrantView assignRoles(@PathVariable long userId, @RequestBody AssignRolesRequest req) {
        return userGrantService.assignRoles(userId, req.roleIds());
    }

    @PutMapping("/{userId}/department")
    @RequiresPermission("forge:user:btn:assign")
    public UserGrantView setDepartment(@PathVariable long userId, @RequestBody SetDepartmentRequest req) {
        return userGrantService.setDepartment(userId, req.departmentId());
    }
}
