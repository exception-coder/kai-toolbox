package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.foreconsult.api.dto.EvidenceRouteRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.EvidenceRouteView;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultEvidenceRouteService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 管理链路分析候选和人工确认的数据归属。 */
@RestController
@RequestMapping("/api/fore-consult/evidence-routes")
@RequireAuth
public class EvidenceRouteController {

    private final ConsultEvidenceRouteService service;

    public EvidenceRouteController(ConsultEvidenceRouteService service) {
        this.service = service;
    }

    @GetMapping
    public List<EvidenceRouteView> list() {
        return service.list().stream().map(EvidenceRouteView::from).toList();
    }

    @PostMapping
    @RequireRole("ADMIN")
    public EvidenceRouteView create(@Valid @RequestBody EvidenceRouteRequest request) {
        return EvidenceRouteView.from(service.create(request));
    }

    @PutMapping("/{id}")
    @RequireRole("ADMIN")
    public EvidenceRouteView update(@PathVariable String id, @Valid @RequestBody EvidenceRouteRequest request) {
        return EvidenceRouteView.from(service.update(id, request));
    }

    @DeleteMapping("/{id}")
    @RequireRole("ADMIN")
    public void delete(@PathVariable String id) {
        service.delete(id);
    }
}
