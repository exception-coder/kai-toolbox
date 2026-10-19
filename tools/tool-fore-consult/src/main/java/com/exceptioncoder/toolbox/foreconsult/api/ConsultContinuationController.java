package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultSessionView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.service.continuation.ConsultContinuationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

/** 显式延续创建，不修改或归档来源咨询。 */
@RestController
@RequireAuth
@RequestMapping("/api/fore-consult/sessions")
public class ConsultContinuationController {
    private final ConsultContinuationService service;

    public ConsultContinuationController(ConsultContinuationService service) {
        this.service = service;
    }

    @PostMapping("/{sourceId}/continuations/{requestId}")
    public ConsultSessionView start(@PathVariable String sourceId, @PathVariable String requestId,
                                   @Valid @RequestBody StartSessionRequest request) {
        return ConsultSessionView.from(service.start(sourceId, requestId, request));
    }
}
