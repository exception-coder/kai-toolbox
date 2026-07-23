package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.forge.api.dto.RoleDetailView;
import com.exceptioncoder.toolbox.common.forge.api.dto.RoleSaveRequest;
import com.exceptioncoder.toolbox.common.forge.api.dto.RoleView;
import com.exceptioncoder.toolbox.common.forge.exception.ForbiddenException;
import com.exceptioncoder.toolbox.common.forge.model.DataScopeType;
import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import com.exceptioncoder.toolbox.common.forge.model.Role;
import com.exceptioncoder.toolbox.common.forge.repository.RolePermissionRepository;
import com.exceptioncoder.toolbox.common.forge.repository.RoleRepository;
import com.exceptioncoder.toolbox.common.forge.repository.UserRoleRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * 角色 CRUD + 权限码绑定。内置角色（超管）不可删、不可改 code、不可收回权限（FR-ROLE-03）；
 * 删除前校验用户占用（FR-ROLE-05）。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class RoleService {

    private final RoleRepository roleRepository;
    private final RolePermissionRepository rolePermissionRepository;
    private final UserRoleRepository userRoleRepository;
    private final ForgeAuditService auditService;

    public RoleService(RoleRepository roleRepository,
                       RolePermissionRepository rolePermissionRepository,
                       UserRoleRepository userRoleRepository,
                       ForgeAuditService auditService) {
        this.roleRepository = roleRepository;
        this.rolePermissionRepository = rolePermissionRepository;
        this.userRoleRepository = userRoleRepository;
        this.auditService = auditService;
    }

    public List<RoleView> list() {
        return roleRepository.findAll().stream().map(RoleView::from).toList();
    }

    public RoleDetailView detail(long id) {
        Role role = roleRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("角色不存在"));
        return RoleDetailView.of(role, rolePermissionRepository.findPermissionIdsByRole(id));
    }

    @Transactional
    public RoleView create(RoleSaveRequest req) {
        String code = req.code().trim();
        if (roleRepository.existsByCode(code)) {
            throw new IllegalArgumentException("角色编码已存在：" + code);
        }
        long now = System.currentTimeMillis();
        Role role = Role.builder()
                .name(req.name().trim())
                .code(code)
                .description(req.description())
                .builtin(false)
                .dataScopeType(req.dataScopeType() == null ? DataScopeType.SELF : req.dataScopeType())
                .status(req.status() == null ? EntityStatus.ENABLED : req.status())
                .createdAt(now)
                .updatedAt(now)
                .build();
        long id = roleRepository.insert(role);
        role.setId(id);
        auditService.record("ROLE_CREATE", "ROLE", String.valueOf(id), role.getName());
        return RoleView.from(role);
    }

    @Transactional
    public RoleView update(long id, RoleSaveRequest req) {
        Role existing = roleRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("角色不存在"));
        String code = req.code().trim();
        if (existing.isBuiltin()) {
            // 内置角色：code 与启用状态锁定，仅允许改名称/描述。
            if (!code.equals(existing.getCode())) {
                throw ForbiddenException.builtinRoleProtected();
            }
        } else {
            if (!code.equals(existing.getCode()) && roleRepository.existsByCode(code)) {
                throw new IllegalArgumentException("角色编码已存在：" + code);
            }
            existing.setCode(code);
            if (req.status() != null) {
                existing.setStatus(req.status());
            }
        }
        existing.setName(req.name().trim());
        existing.setDescription(req.description());
        if (req.dataScopeType() != null) {
            existing.setDataScopeType(req.dataScopeType());
        }
        existing.setUpdatedAt(System.currentTimeMillis());
        roleRepository.update(existing);
        auditService.record("ROLE_UPDATE", "ROLE", String.valueOf(id), existing.getName());
        return RoleView.from(existing);
    }

    @Transactional
    public void delete(long id) {
        Role existing = roleRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("角色不存在"));
        if (existing.isBuiltin()) {
            throw ForbiddenException.builtinRoleProtected();
        }
        if (userRoleRepository.countByRole(id) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "角色仍被用户绑定，无法删除");
        }
        rolePermissionRepository.deleteByRole(id);
        roleRepository.deleteById(id);
        auditService.record("ROLE_DELETE", "ROLE", String.valueOf(id), existing.getName());
    }

    @Transactional
    public RoleDetailView bindPermissions(long id, List<Long> permissionIds) {
        Role existing = roleRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("角色不存在"));
        if (existing.isBuiltin()) {
            // 内置超管 bypass 全部校验，权限码绑定无意义且不可收回。
            throw ForbiddenException.builtinRoleProtected();
        }
        List<Long> target = permissionIds == null ? List.of() : permissionIds.stream().distinct().toList();
        rolePermissionRepository.deleteByRole(id);
        rolePermissionRepository.insertBatch(id, target);
        auditService.record("ROLE_PERM_BIND", "ROLE", String.valueOf(id), target.toString());
        return RoleDetailView.of(existing, target);
    }
}
