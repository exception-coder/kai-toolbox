package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.AssistantFeedbackArchiveService;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCandidateView;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 彩虹胶囊会话归档、三类反馈标签、修订历史与附件回读 API。 */
@RequireAuth
@RestController
@RequestMapping("/api/assistant/feedback-sessions")
public class AssistantFeedbackArchiveController {
    private final AssistantFeedbackArchiveService service;

    public AssistantFeedbackArchiveController(AssistantFeedbackArchiveService service) {
        this.service = service;
    }

    @GetMapping
    public AssistantFeedbackArchiveService.SessionPage sessions(
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return service.listSessions(cursor, limit);
    }

    @GetMapping("/{sessionId}/candidates")
    public AssistantFeedbackArchiveService.CandidateResult candidates(
            @PathVariable String sessionId, @RequestParam String category,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return service.listCandidates(sessionId, category, cursor, limit);
    }

    @PatchMapping("/{sessionId}/candidates/{candidateId}")
    public FeedbackCandidateView updateCandidate(@PathVariable String sessionId, @PathVariable String candidateId,
            @RequestBody AssistantFeedbackArchiveService.UpdateRequest request) {
        return service.updateCandidate(sessionId, candidateId, request);
    }

    @GetMapping("/{sessionId}/candidates/{candidateId}/revisions")
    public AssistantFeedbackArchiveService.RevisionResult revisions(
            @PathVariable String sessionId, @PathVariable String candidateId,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return service.listRevisions(sessionId, candidateId, cursor, limit);
    }

    @GetMapping("/{sessionId}/candidates/{candidateId}/attachments/{attachmentId}")
    public ResponseEntity<Resource> attachment(@PathVariable String sessionId,
            @PathVariable String candidateId, @PathVariable String attachmentId) {
        AttachmentStorageService.ArchivedAttachment archived =
                service.loadAttachment(sessionId, candidateId, attachmentId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType(archived.mime()))
                .contentLength(archived.metadata().size())
                .body(new PathResource(archived.file()));
    }
}
