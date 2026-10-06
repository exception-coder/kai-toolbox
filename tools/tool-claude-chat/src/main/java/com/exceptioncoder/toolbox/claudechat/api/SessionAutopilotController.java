package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionAutopilotService;
import com.exceptioncoder.toolbox.claudechat.service.AutopilotProgressConflictException;
import com.exceptioncoder.toolbox.claudechat.service.AutopilotBindingPreviewService;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecChangeCatalog;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter;
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
import java.util.Map;

/** 会话 OpenSpec 自动监督的配置、控制、进度回灌与看板接口。 */
@RestController
@RequestMapping("/api/claude-chat")
public class SessionAutopilotController {

    private final SessionAutopilotService service;
    private final ClaudeChatSessionAccessPolicy accessPolicy;
    private final AutopilotBindingPreviewService bindingPreview;

    public SessionAutopilotController(SessionAutopilotService service,
                                      ClaudeChatSessionAccessPolicy accessPolicy,
                                      AutopilotBindingPreviewService bindingPreview) {
        this.service = service;
        this.accessPolicy = accessPolicy;
        this.bindingPreview = bindingPreview;
    }

    @GetMapping("/sessions/{sessionId}/openspec/changes")
    public List<SessionAutopilotView.ChangeOption> changes(
            @PathVariable String sessionId,
            @RequestParam(required = false) String projectRoot) {
        requireAccess(sessionId);
        return service.listChanges(sessionId, projectRoot);
    }

    @GetMapping("/sessions/{sessionId}/autopilot/candidates")
    public List<AutopilotBindingPreviewService.Candidate> candidates(
            @PathVariable String sessionId, @RequestParam(required = false) String projectRoot) {
        requireAccess(sessionId);
        return bindingPreview.preview(sessionId, projectRoot);
    }

    @GetMapping("/sessions/{sessionId}/autopilot/ai-recommendations")
    public List<String> aiRecommendations(@PathVariable String sessionId,
                                          @RequestParam(required = false) String projectRoot) {
        requireAccess(sessionId);
        return bindingPreview.recommendAi(sessionId, projectRoot);
    }

    @GetMapping("/sessions/{sessionId}/openspec/change-catalog")
    public OpenSpecChangeCatalog.Page changeCatalog(@PathVariable String sessionId,
            @RequestParam(required = false) String projectRoot,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "20") int limit) {
        requireAccess(sessionId);
        return bindingPreview.catalog(sessionId, projectRoot, query, offset, limit);
    }

    @GetMapping("/sessions/{sessionId}/autopilot/candidates/{changeId}")
    public AutopilotBindingPreviewService.Candidate checkCandidate(
            @PathVariable String sessionId, @PathVariable String changeId,
            @RequestParam(required = false) String projectRoot) {
        requireAccess(sessionId);
        return bindingPreview.check(sessionId, projectRoot, changeId);
    }

    @GetMapping("/sessions/{sessionId}/autopilot")
    public ResponseEntity<SessionAutopilotView.Run> current(@PathVariable String sessionId) {
        requireAccess(sessionId);
        return service.current(sessionId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/sessions/{sessionId}/autopilot/batch")
    public ResponseEntity<SessionAutopilotService.BatchView> batch(@PathVariable String sessionId) {
        requireAccess(sessionId);
        return service.batch(sessionId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/sessions/{sessionId}/autopilot/tasks")
    public List<OpenSpecAutopilotAdapter.TaskSnapshot> tasks(@PathVariable String sessionId) {
        requireAccess(sessionId);
        return service.tasks(sessionId);
    }

    @GetMapping("/sessions/{sessionId}/autopilot/changes/{changeId}/tasks")
    public List<OpenSpecAutopilotAdapter.TaskSnapshot> selectedTasks(@PathVariable String sessionId,
            @PathVariable String changeId) {
        requireAccess(sessionId);
        return service.tasks(sessionId, changeId);
    }

    @PutMapping("/sessions/{sessionId}/autopilot")
    public SessionAutopilotView.Run start(@PathVariable String sessionId,
                                          @RequestBody StartRequest request) {
        requireAccess(sessionId);
        return service.start(sessionId, new SessionAutopilotService.StartRequest(
                request.projectRoot(), request.changeId(), request.goal(), request.autoArchive(),
                request.maxTurns(), request.maxNoProgress(), request.deadlineMinutes(), request.expectedRevision(),
                request.changeIds(), request.expectedRevisions()));
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
        try {
            return service.reportProgress(sessionId, new SessionAutopilotService.ProgressReport(
                    request.disposition(), request.summary(), request.nextAction(), request.remainingWork(),
                    request.evidence(), request.reason()));
        } catch (AutopilotProgressConflictException conflict) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    conflict.getMessage() + "；当前版本 " + conflict.version()
                            + "；GET /api/claude-chat/sessions/" + sessionId + "/autopilot"
                            + "，POST /api/claude-chat/sessions/" + sessionId
                            + "/autopilot/actions/resume {\"expectedVersion\":" + conflict.version() + "}");
        }
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
                               Integer maxTurns, Integer maxNoProgress, Integer deadlineMinutes,
                               String expectedRevision, List<String> changeIds,
                               Map<String, String> expectedRevisions) {
    }

    public record ActionRequest(long expectedVersion) {
    }

    public record ProgressRequest(String disposition, String summary, String nextAction,
                                  List<String> remainingWork, List<String> evidence, String reason) {
    }
}
