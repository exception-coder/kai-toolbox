package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.SessionAffectedApi;
import com.exceptioncoder.toolbox.claudechat.service.SessionAffectedApiService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 当前 Coding 会话的 OpenSpec 接口影响证据登记、查询与发布就绪聚合。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/affected-apis")
public class SessionAffectedApiController {

    private final SessionAffectedApiService service;

    public SessionAffectedApiController(SessionAffectedApiService service) {
        this.service = service;
    }

    @GetMapping
    public List<SessionAffectedApi> list(@PathVariable String sessionId) {
        return service.list(sessionId);
    }

    /** Agent Tool 回灌入口；sessionId 只取路径中由 Sidecar 注入的当前会话。 */
    @PutMapping("/auto-register")
    public List<SessionAffectedApi> register(@PathVariable String sessionId,
                                             @RequestBody RegisterRequest request) {
        List<ApiRequest> apis = request.apis() == null ? List.of() : request.apis();
        return service.register(sessionId, apis.stream().map(ApiRequest::toRegistration).toList());
    }

    @GetMapping("/readiness")
    public SessionAffectedApiService.Readiness readiness(@PathVariable String sessionId) {
        return service.readiness(sessionId);
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@PathVariable String sessionId) {
        service.delete(sessionId);
        return ResponseEntity.noContent().build();
    }

    public record RegisterRequest(List<ApiRequest> apis) {
    }

    public record ApiRequest(String method, String path, String changeType, String sourceFile,
                             String handlerName, String summary, String verificationStatus,
                             String verificationMethod, String verificationCommand,
                             String verificationSummary) {
        private SessionAffectedApiService.Registration toRegistration() {
            return new SessionAffectedApiService.Registration(method, path, changeType, sourceFile,
                    handlerName, summary, verificationStatus, verificationMethod,
                    verificationCommand, verificationSummary);
        }
    }
}
