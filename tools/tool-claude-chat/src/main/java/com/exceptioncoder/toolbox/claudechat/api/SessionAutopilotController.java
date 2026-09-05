package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionAutopilotService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** 会话 OpenSpec 自动监督的配置、控制、进度回灌与看板接口。 */
@RestController
@RequestMapping("/api/claude-chat")
public class SessionAutopilotController {

    private final SessionAutopilotService service;
    private final ClaudeChatSessionAccessPolicy accessPolicy;

    public SessionAutopilotController(SessionAutopilotService service,
                                      ClaudeChatSessionAccessPolicy accessPolicy) {
        this.service = service;
        this.accessPolicy = accessPolicy;
    }

    @GetMapping("/sessions/{sessionId}/openspec/changes")
    public List<SessionAutopilotView.ChangeOption> changes(
            @PathVariable String sessionId,
            @RequestParam(required = false) String projectRoot) {
        requireAccess(sessionId);
        return service.listChanges(sessionId, projectRoot);
    }

    @GetMapping("/sessions/{sessionId}/autopilot")
    public ResponseEntity<SessionAutopilotView.Run> current(@PathVariable String sessionId) {
        requireAccess(sessionId);
        return service.current(sessionId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/sessions/{sessionId}/autopilot")
    public SessionAutopilotView.Run start(@PathVariable String sessionId,
                                          @RequestBody StartRequest request) {
        requireAccess(sessionId);
        return service.start(sessionId, new SessionAutopilotService.StartRequest(
                request.projectRoot(), request.changeId(), request.goal(), request.autoArchive(),
                request.maxTurns(), request.maxNoProgress(), request.deadlineMinutes()));
    }

    @PostMapping("/sessions/{sessionId}/autopilot/actions/{action}")
    public SessionAutopilotView.Run action(@PathVariable String sessionId,
                                           @PathVariable String action,
                                           @RequestBody ActionRequest request) {
        requireAccess(sessionId);
        return service.action(sessionId, action, request.expectedVersion());
    }

    /** Sidecar 注入的 Forge MCP 回灌入口；运行身份完全取服务端当前会话绑定。 */
    @PostMapping("/sessions/{sessionId}/autopilot/progress")
    public SessionAutopilotView.Run reportProgress(@PathVariable String sessionId,
                                                    @RequestBody ProgressRequest request) {
        return service.reportProgress(sessionId, new SessionAutopilotService.ProgressReport(
                request.disposition(), request.summary(), request.nextAction(), request.remainingWork(),
                request.evidence(), request.reason()));
    }

    @GetMapping("/autopilot/runs")
    public SessionAutopilotView.Dashboard dashboard(
            @RequestParam(defaultValue = "active") String scope,
            @RequestParam(defaultValue = "") String search,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int limit) {
        return service.dashboard(scope, search, cursor, limit);
    }

    private void requireAccess(String sessionId) {
        if (!accessPolicy.canAccessCurrentUser(sessionId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话");
        }
    }

    public record StartRequest(String projectRoot, String changeId, String goal, boolean autoArchive,
                               Integer maxTurns, Integer maxNoProgress, Integer deadlineMinutes) {
    }

    public record ActionRequest(long expectedVersion) {
    }

    public record ProgressRequest(String disposition, String summary, String nextAction,
                                  List<String> remainingWork, List<String> evidence, String reason) {
    }
}
