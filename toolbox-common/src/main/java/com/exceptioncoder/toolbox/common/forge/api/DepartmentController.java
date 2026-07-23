package com.exceptioncoder.toolbox.common.forge.api;

import com.exceptioncoder.toolbox.common.forge.annotation.RequiresPermission;
import com.exceptioncoder.toolbox.common.forge.api.dto.DepartmentSaveRequest;
import com.exceptioncoder.toolbox.common.forge.api.dto.DepartmentView;
import com.exceptioncoder.toolbox.common.forge.service.DepartmentService;
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
 * 部门管理接口（FR-DEPT）。业务逻辑全部下沉 DepartmentService（NFR-08）。
 */
@RestController
@RequestMapping("/api/forge/departments")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class DepartmentController {

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @GetMapping("/tree")
    @RequiresPermission("forge:dept:menu")
    public List<DepartmentView> tree() {
        return departmentService.tree();
    }

    @PostMapping
    @RequiresPermission("forge:dept:btn:edit")
    public DepartmentView create(@Valid @RequestBody DepartmentSaveRequest req) {
        return departmentService.create(req);
    }

    @PutMapping("/{id}")
    @RequiresPermission("forge:dept:btn:edit")
    public DepartmentView update(@PathVariable long id, @Valid @RequestBody DepartmentSaveRequest req) {
        return departmentService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("forge:dept:btn:delete")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        departmentService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
