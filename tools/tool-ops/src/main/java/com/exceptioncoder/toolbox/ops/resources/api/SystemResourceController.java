package com.exceptioncoder.toolbox.ops.resources.api;

import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.ops.resources.application.SystemResourceService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

/** 系统资源配置与工具调用的统一 HTTP 适配。 */
@RestController
@RequestMapping("/api/ops/resources")
public class SystemResourceController {
    private final SystemResourceService service;
    public SystemResourceController(SystemResourceService service) { this.service = service; }

    @GetMapping public SystemResourceService.Catalog catalog() { return service.catalog(); }
    @GetMapping("/systems/{systemId}")
    public List<SystemResourceService.BoundResource> discover(@PathVariable String systemId) { return service.discover(systemId); }
    @PutMapping("/bindings") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void bind(@RequestBody BindingRequest request) {
        service.bind(request.systemId(), request.providerId(), request.resourceId(), request.purpose(), request.enabled());
    }
    @DeleteMapping("/bindings/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void unbind(@PathVariable String id) { service.unbind(id); }
    @PostMapping("/bindings/{id}/execute")
    public Object execute(@PathVariable String id, @RequestBody ResourceCall call) { return service.execute(id, call); }

    public record BindingRequest(String systemId, String providerId, String resourceId, String purpose, boolean enabled) { }
}
