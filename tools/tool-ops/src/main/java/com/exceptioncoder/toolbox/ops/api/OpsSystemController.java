package com.exceptioncoder.toolbox.ops.api;

import com.exceptioncoder.toolbox.ops.api.dto.SystemRequest;
import com.exceptioncoder.toolbox.ops.api.dto.SystemView;
import com.exceptioncoder.toolbox.ops.service.OpsSystemService;
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

@RestController
@RequestMapping("/api/ops/systems")
public class OpsSystemController {

    private final OpsSystemService service;

    public OpsSystemController(OpsSystemService service) {
        this.service = service;
    }

    @GetMapping
    public List<SystemView> list() {
        return service.findAll().stream().map(SystemView::from).toList();
    }

    @GetMapping("/{id}")
    public SystemView get(@PathVariable String id) {
        return SystemView.from(service.findRequired(id));
    }

    @PostMapping
    public SystemView create(@Valid @RequestBody SystemRequest req) {
        return SystemView.from(service.create(req));
    }

    @PutMapping("/{id}")
    public SystemView update(@PathVariable String id, @Valid @RequestBody SystemRequest req) {
        return SystemView.from(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
