package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ReviewSpaceService;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/claude-chat")
public class ReviewSpaceController {
    private final ReviewSpaceService service;
    private final AttachmentStorageService attachments;
    private final SessionHistoryService history;
    private final ClaudeChatSessionRepository sessions;

    public ReviewSpaceController(ReviewSpaceService service, AttachmentStorageService attachments,
                                 SessionHistoryService history, ClaudeChatSessionRepository sessions) {
        this.service = service;
        this.attachments = attachments;
        this.history = history;
        this.sessions = sessions;
    }

    @PostMapping("/sessions/{sessionId}/reviews")
    public Map<String, Object> create(@PathVariable String sessionId, @RequestBody CreateReviewRequest request) {
        var created = service.create(sessionId, new ReviewSpaceService.CreateCommand(
                request.mode(), request.title(), request.contextSnapshot(), request.expiresInDays(), request.lastTurnId()));
        return Map.of("review", ReviewView.from(created.space()), "token", created.token(),
                "sharePath", "/review/" + created.token());
    }

    @GetMapping("/sessions/{sessionId}/reviews")
    public List<ReviewView> list(@PathVariable String sessionId) {
        return service.list(sessionId).stream().map(ReviewView::from).toList();
    }

    @GetMapping("/sessions/{sessionId}/review-relations")
    public ReviewSpaceService.RelationContext relations(@PathVariable String sessionId) {
        return service.relationContext(sessionId);
    }

    @PatchMapping("/review-feedback/{id}")
    public ResponseEntity<Void> handleFeedback(@PathVariable String id,
                                               @RequestBody HandleFeedbackRequest request) {
        return service.handleFeedback(id, request.status())
                ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/reviews/{id}")
    public ResponseEntity<Void> revoke(@PathVariable String id) {
        return service.revoke(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping("/reviews/public/{token}")
    public ResponseEntity<PublicReviewView> publicView(@PathVariable String token) {
        return service.resolve(token)
                .map(space -> ResponseEntity.ok(PublicReviewView.from(space, service.sourceTitle(space))))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/reviews/public/{token}/feedback")
    public ResponseEntity<ReviewFeedbackView> submitFeedback(@PathVariable String token,
                                                              @RequestBody SubmitFeedbackRequest request) {
        if (service.resolve(token).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        try {
            return ResponseEntity.ok(ReviewFeedbackView.from(service.submitFeedback(
                    token, request.content(), request.sourceMessageId())));
        } catch (IllegalArgumentException error) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/reviews/public/{token}/attachments")
    public ResponseEntity<AttachmentView> upload(@PathVariable String token,
                                                  @RequestPart("file") MultipartFile file) throws IOException {
        ReviewSpace space = service.resolve(token).orElse(null);
        if (space == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(attachments.store(space.reviewSessionId(), file));
    }

    @GetMapping("/reviews/public/{token}/messages")
    public ResponseEntity<MessagePage> messages(@PathVariable String token,
                                                 @RequestParam(required = false) Integer before,
                                                 @RequestParam(defaultValue = "30") int limit) {
        ReviewSpace space = service.resolve(token).orElse(null);
        if (space == null) return ResponseEntity.notFound().build();
        return sessions.findById(space.reviewSessionId())
                .map(session -> ResponseEntity.ok(history.readMessages(session.getCwd(), session.getSdkSessionId(),
                        session.getCodexHome(), before, limit)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/reviews/public/{token}/files")
    public ResponseEntity<Resource> file(@PathVariable String token, @RequestParam String path) throws IOException {
        ReviewSpace space = service.resolve(token).orElse(null);
        if (space == null) return ResponseEntity.notFound().build();
        var session = sessions.findById(space.reviewSessionId()).orElse(null);
        if (session == null) return ResponseEntity.notFound().build();
        Path reviewRoot = Path.of(session.getCwd()).toAbsolutePath().normalize();
        Path file;
        try {
            file = Path.of(path).toAbsolutePath().normalize();
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
        if (!file.startsWith(reviewRoot.resolve(".kai-chat-attachments")) || !Files.isRegularFile(file)) {
            return ResponseEntity.status(403).build();
        }
        String mime = Files.probeContentType(file);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime == null ? "application/octet-stream" : mime))
                .body(new PathResource(file));
    }

    public record CreateReviewRequest(String mode, String title, String contextSnapshot,
                                      long expiresInDays, String lastTurnId) {}
    public record ReviewView(String id, String sourceSessionId, String reviewSessionId, String mode,
                             String status, String title, long expiresAt, long createdAt) {
        static ReviewView from(ReviewSpace s) {
            return new ReviewView(s.id(), s.sourceSessionId(), s.reviewSessionId(), s.mode(),
                    s.status(), s.title(), s.expiresAt(), s.createdAt());
        }
    }
    public record PublicReviewView(String reviewSessionId, String title, String sourceTitle, String mode,
                                   String contextSnapshot, long expiresAt) {
        static PublicReviewView from(ReviewSpace s, String sourceTitle) {
            return new PublicReviewView(s.reviewSessionId(), s.title(), sourceTitle,
                    s.mode(), s.contextSnapshot(), s.expiresAt());
        }
    }

    public record SubmitFeedbackRequest(String content, String sourceMessageId) {}
    public record HandleFeedbackRequest(String status) {}
    public record ReviewFeedbackView(String id, String status, long createdAt) {
        static ReviewFeedbackView from(com.exceptioncoder.toolbox.claudechat.domain.ReviewFeedback feedback) {
            return new ReviewFeedbackView(feedback.id(), feedback.status(), feedback.createdAt());
        }
    }
}
