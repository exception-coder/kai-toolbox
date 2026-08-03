package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.exceptioncoder.toolbox.claudechat.service.SessionPendingSqlService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 会话待执行 SQL 的登记接口，只维护本地台账，不执行 SQL。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/pending-sql")
public class SessionPendingSqlController {

    private final SessionPendingSqlService service;

    public SessionPendingSqlController(SessionPendingSqlService service) {
        this.service = service;
    }

    /** 查询登记；未登记返回 204。 */
    @GetMapping
    public ResponseEntity<SessionPendingSql> get(@PathVariable String sessionId) {
        SessionPendingSql pendingSql = service.get(sessionId);
        return pendingSql == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(pendingSql);
    }

    /** 新建或更新登记，并将状态置为待执行。 */
    @PutMapping
    public SessionPendingSql save(@PathVariable String sessionId, @RequestBody SaveRequest request) {
        return service.save(sessionId, request.title(), request.targetEnvironment(),
                request.changeType(), request.sqlText());
    }

    /** Forge Agent Tool 回灌入口：只登记、去重和合并，绝不连接或执行目标数据库。 */
    @PutMapping("/auto-register")
    public SessionPendingSql autoRegister(@PathVariable String sessionId,
                                          @RequestBody AutoRegisterRequest request) {
        return service.registerFromTool(sessionId, request.title(), request.targetEnvironment(),
                request.changeType(), request.sqlText(), request.mode());
    }

    /** 人工维护执行状态，不触发目标库操作。 */
    @PutMapping("/status")
    public SessionPendingSql updateStatus(@PathVariable String sessionId,
                                          @RequestBody StatusRequest request) {
        return service.updateStatus(sessionId, request.status());
    }

    /** 解除登记关联。 */
    @DeleteMapping
    public ResponseEntity<Void> delete(@PathVariable String sessionId) {
        service.delete(sessionId);
        return ResponseEntity.noContent().build();
    }

    public record SaveRequest(String title, String targetEnvironment, String changeType, String sqlText) {
    }

    public record StatusRequest(String status) {
    }

    public record AutoRegisterRequest(String title, String targetEnvironment, String changeType,
                                      String sqlText, String mode) {
    }
}
