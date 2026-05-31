package com.exceptioncoder.toolbox.docker.api;

import com.exceptioncoder.toolbox.docker.api.dto.DockerAppRequest;
import com.exceptioncoder.toolbox.docker.api.dto.DockerAppView;
import com.exceptioncoder.toolbox.docker.api.dto.ScanRequest;
import com.exceptioncoder.toolbox.docker.api.dto.ScanResponse;
import com.exceptioncoder.toolbox.docker.service.DockerService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/docker/hosts/{hostId}")
public class DockerAppController {

    private final DockerService service;

    public DockerAppController(DockerService service) {
        this.service = service;
    }

    @GetMapping("/apps")
    public List<DockerAppView> list(@PathVariable String hostId) {
        return service.listApps(hostId).stream().map(DockerAppView::from).toList();
    }

    @PostMapping("/apps")
    public ResponseEntity<DockerAppView> create(@PathVariable String hostId,
                                                @Valid @RequestBody DockerAppRequest req) {
        DockerAppView v = DockerAppView.from(service.createApp(hostId, req));
        return ResponseEntity.status(201).body(v);
    }

    @PutMapping("/apps/{appId}")
    public DockerAppView update(@PathVariable String hostId, @PathVariable String appId,
                                @Valid @RequestBody DockerAppRequest req) {
        return DockerAppView.from(service.updateApp(hostId, appId, req));
    }

    @DeleteMapping("/apps/{appId}")
    public ResponseEntity<Void> delete(@PathVariable String hostId, @PathVariable String appId) {
        service.deleteApp(hostId, appId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/scan")
    public ScanResponse scan(@PathVariable String hostId, @Valid @RequestBody ScanRequest req) {
        int depth = req.maxDepth() == null ? 3 : req.maxDepth();
        return new ScanResponse(service.scan(hostId, req.baseDir().trim(), depth));
    }
}
