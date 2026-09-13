package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultResourceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultResourceAccess;
import java.util.List;

/** 资源管理目录与会话限定的只读工具适配。 */
@RestController
@RequestMapping("/api/fore-consult/resources")
public class ConsultResourceController {
    private final ConsultResourceService service;
    private final ConsultResourceAccess access;
    public ConsultResourceController(ConsultResourceService service,
                                     ConsultResourceAccess access) {
        this.service = service; this.access = access;
    }

    @GetMapping @RequireRole("ADMIN")
    public List<ReadonlyResourceGateway.Entry> catalog() { return service.catalog(); }

    @GetMapping("/sessions/{runtimeId}")
    public List<ReadonlyResourceGateway.Entry> discover(@PathVariable String runtimeId,
            @RequestHeader(value = "X-Consult-Resource-Token", required = false) String token) {
        access.require(runtimeId, token);
        return service.discover(runtimeId);
    }

    @PostMapping("/sessions/{runtimeId}/query")
    public Object query(@PathVariable String runtimeId, @RequestBody Query request,
                        @RequestHeader(value = "X-Consult-Resource-Token", required = false) String token) {
        access.require(runtimeId, token);
        return service.query(runtimeId, request.bindingId(), request.sql());
    }
    public record Query(String bindingId, String sql) { }
}
