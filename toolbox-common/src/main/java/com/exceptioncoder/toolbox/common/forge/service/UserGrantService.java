package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.forge.api.dto.UserGrantView;
import com.exceptioncoder.toolbox.common.forge.model.Department;
import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import com.exceptioncoder.toolbox.common.forge.repository.DepartmentRepository;
import com.exceptioncoder.toolbox.common.forge.repository.RoleRepository;
import com.exceptioncoder.toolbox.common.forge.repository.UserDepartmentRepository;
import com.exceptioncoder.toolbox.common.forge.repository.UserRoleRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * 用户的 Forge 授权归属管理：多角色分配（全量覆盖）+ 单部门归属。
 * 变更不强制下线目标用户——权限于其下次刷新/重登时经 AuthoritiesResolver 重新解析生效（AC-06）。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class UserGrantService {

    private final UserRoleRepository userRoleRepository;
    private final UserDepartmentRepository userDepartmentRepository;
    private final RoleRepository roleRepository;
    private final DepartmentRepository departmentRepository;
    private final ForgeAuditService auditService;

    public UserGrantService(UserRoleRepository userRoleRepository,
                            UserDepartmentRepository userDepartmentRepository,
                            RoleRepository roleRepository,
                            DepartmentRepository departmentRepository,
                            ForgeAuditService auditService) {
        this.userRoleRepository = userRoleRepository;
        this.userDepartmentRepository = userDepartmentRepository;
        this.roleRepository = roleRepository;
        this.departmentRepository = departmentRepository;
        this.auditService = auditService;
    }

    public UserGrantView view(long userId) {
        return new UserGrantView(
                userId,
                userRoleRepository.findRoleIdsByUser(userId),
                userDepartmentRepository.findDepartmentIdByUser(userId).orElse(null));
    }

    /** 所有账号的授权归属，供账号列表批量展示 forge 角色/部门。 */
    public List<UserGrantView> allGrants() {
        Map<Long, List<Long>> roleMap = userRoleRepository.findAllGroupedByUser();
        Map<Long, Long> deptMap = userDepartmentRepository.findAll();
        TreeSet<Long> userIds = new TreeSet<>();
        userIds.addAll(roleMap.keySet());
        userIds.addAll(deptMap.keySet());
        return userIds.stream()
                .map(uid -> new UserGrantView(uid, roleMap.getOrDefault(uid, List.of()), deptMap.get(uid)))
                .toList();
    }

    @Transactional
    public UserGrantView assignRoles(long userId, List<Long> roleIds) {
        List<Long> target = roleIds == null ? List.of() : roleIds.stream().distinct().toList();
        if (roleRepository.findByIds(target).size() != target.size()) {
            throw new IllegalArgumentException("包含不存在的角色");
        }
        userRoleRepository.deleteByUser(userId);
        userRoleRepository.insertBatch(userId, target);
        auditService.record("USER_ROLE_ASSIGN", "USER", String.valueOf(userId), target.toString());
        return view(userId);
    }

    @Transactional
    public UserGrantView setDepartment(long userId, Long departmentId) {
        if (departmentId == null) {
            userDepartmentRepository.deleteByUser(userId);
            auditService.record("USER_DEPT_SET", "USER", String.valueOf(userId), "null");
            return view(userId);
        }
        Department dept = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new IllegalArgumentException("部门不存在"));
        if (dept.getStatus() == EntityStatus.DISABLED) {
            throw new IllegalArgumentException("部门已停用，不可作为归属");
        }
        userDepartmentRepository.upsert(userId, departmentId);
        auditService.record("USER_DEPT_SET", "USER", String.valueOf(userId), String.valueOf(departmentId));
        return view(userId);
    }
}
