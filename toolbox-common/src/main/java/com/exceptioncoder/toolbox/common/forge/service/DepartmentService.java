package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.forge.api.dto.DepartmentSaveRequest;
import com.exceptioncoder.toolbox.common.forge.api.dto.DepartmentView;
import com.exceptioncoder.toolbox.common.forge.exception.DepartmentInUseException;
import com.exceptioncoder.toolbox.common.forge.model.Department;
import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import com.exceptioncoder.toolbox.common.forge.repository.DepartmentRepository;
import com.exceptioncoder.toolbox.common.forge.repository.UserDepartmentRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 部门树 CRUD。删除前校验子部门 / 挂用户（FR-DEPT-02）。部门仅作组织容器，不参与鉴权链。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final UserDepartmentRepository userDepartmentRepository;
    private final ForgeAuditService auditService;

    public DepartmentService(DepartmentRepository departmentRepository,
                             UserDepartmentRepository userDepartmentRepository,
                             ForgeAuditService auditService) {
        this.departmentRepository = departmentRepository;
        this.userDepartmentRepository = userDepartmentRepository;
        this.auditService = auditService;
    }

    public List<DepartmentView> tree() {
        List<Department> all = departmentRepository.findAll();
        return buildChildren(0L, all);
    }

    private List<DepartmentView> buildChildren(long parentId, List<Department> all) {
        return all.stream()
                .filter(d -> d.getParentId() == parentId)
                .map(d -> DepartmentView.of(d, buildChildren(d.getId(), all)))
                .toList();
    }

    @Transactional
    public DepartmentView create(DepartmentSaveRequest req) {
        long parentId = req.parentId() == null ? 0 : req.parentId();
        requireParentExists(parentId);
        String code = normalizeCode(req.code());
        if (code != null && departmentRepository.existsByCode(code)) {
            throw new IllegalArgumentException("部门编码已存在：" + code);
        }
        long now = System.currentTimeMillis();
        Department dept = Department.builder()
                .parentId(parentId)
                .name(req.name().trim())
                .code(code)
                .sort(req.sort() == null ? 0 : req.sort())
                .status(req.status() == null ? EntityStatus.ENABLED : req.status())
                .createdAt(now)
                .updatedAt(now)
                .build();
        long id = departmentRepository.insert(dept);
        dept.setId(id);
        auditService.record("DEPT_CREATE", "DEPARTMENT", String.valueOf(id), dept.getName());
        return DepartmentView.of(dept, List.of());
    }

    @Transactional
    public DepartmentView update(long id, DepartmentSaveRequest req) {
        Department existing = departmentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("部门不存在"));
        long parentId = req.parentId() == null ? 0 : req.parentId();
        if (parentId == id) {
            throw new IllegalArgumentException("父部门不能是自己");
        }
        requireParentExists(parentId);
        String code = normalizeCode(req.code());
        if (code != null && !code.equals(existing.getCode()) && departmentRepository.existsByCode(code)) {
            throw new IllegalArgumentException("部门编码已存在：" + code);
        }
        existing.setParentId(parentId);
        existing.setName(req.name().trim());
        existing.setCode(code);
        if (req.sort() != null) {
            existing.setSort(req.sort());
        }
        if (req.status() != null) {
            existing.setStatus(req.status());
        }
        existing.setUpdatedAt(System.currentTimeMillis());
        departmentRepository.update(existing);
        auditService.record("DEPT_UPDATE", "DEPARTMENT", String.valueOf(id), existing.getName());
        return DepartmentView.of(existing, List.of());
    }

    @Transactional
    public void delete(long id) {
        departmentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("部门不存在"));
        if (departmentRepository.countChildren(id) > 0) {
            throw new DepartmentInUseException("存在子部门，无法删除");
        }
        if (userDepartmentRepository.countByDepartment(id) > 0) {
            throw new DepartmentInUseException("部门下仍有用户，无法删除");
        }
        departmentRepository.deleteById(id);
        auditService.record("DEPT_DELETE", "DEPARTMENT", String.valueOf(id), null);
    }

    private void requireParentExists(long parentId) {
        if (parentId != 0 && departmentRepository.findById(parentId).isEmpty()) {
            throw new IllegalArgumentException("父部门不存在");
        }
    }

    private String normalizeCode(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        return code.trim();
    }
}
