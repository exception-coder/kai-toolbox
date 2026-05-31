package com.exceptioncoder.toolbox.hosts.api;

import com.exceptioncoder.toolbox.hosts.api.dto.HostRequest;
import com.exceptioncoder.toolbox.hosts.api.dto.HostView;
import com.exceptioncoder.toolbox.hosts.api.dto.TestHostResult;
import com.exceptioncoder.toolbox.hosts.service.HostsService;
import jakarta.validation.Valid;
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
 * 全局 SSH 主机 CRUD，被 treesize / frp 等共用。
 * 旧路径 {@code /api/treesize/ssh-hosts/*} 已废弃，前端统一调用本接口。
 */
@RestController
@RequestMapping("/api/hosts")
public class HostsController {

    private final HostsService service;

    public HostsController(HostsService service) {
        this.service = service;
    }

    @GetMapping
    public List<HostView> list() {
        return service.findAll().stream().map(HostView::from).toList();
    }

    @GetMapping("/{id}")
    public HostView get(@PathVariable String id) {
        return HostView.from(service.findRequired(id));
    }

    @PostMapping
    public HostView create(@Valid @RequestBody HostRequest req) {
        return HostView.from(service.create(req));
    }

    @PutMapping("/{id}")
    public HostView update(@PathVariable String id, @Valid @RequestBody HostRequest req) {
        return HostView.from(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/test")
    public TestHostResult test(@Valid @RequestBody HostRequest req) {
        String message = service.test(req);
        return new TestHostResult(true, message);
    }

    @PostMapping("/{id}/test")
    public TestHostResult testSaved(@PathVariable String id) {
        String message = service.test(service.findRequired(id));
        return new TestHostResult(true, message);
    }
}
