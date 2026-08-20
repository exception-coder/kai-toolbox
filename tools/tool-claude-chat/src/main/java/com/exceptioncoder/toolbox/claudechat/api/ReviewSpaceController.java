package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.LocalNetworkAddressService;
import com.exceptioncoder.toolbox.claudechat.service.ReviewSpaceService;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
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
    private final LocalNetworkAddressService localNetworkAddress;

    public ReviewSpaceController(ReviewSpaceService service, AttachmentStorageService attachments,
                                 SessionHistoryService history, ClaudeChatSessionRepository sessions,
                                 LocalNetworkAddressService localNetworkAddress) {
        this.service = service;
        this.attachments = attachments;
        this.history = history;
        this.sessions = sessions;
        this.localNetworkAddress = localNetworkAddress;
    }

    @PostMapping("/sessions/{sessionId}/reviews")
    public Map<String, Object> create(@PathVariable String sessionId, @RequestBody CreateReviewRequest request) {
        var created = service.create(sessionId, new ReviewSpaceService.CreateCommand(
                request.mode(), request.title(), request.contextSnapshot(), request.expiresInDays(), request.lastTurnId(),
                request.codexHome()));
        return Map.of("review", ReviewView.from(created.space()), "token", created.token(),
                "sharePath", "/review/" + created.token(),
                "lanIpv4", localNetworkAddress.preferredIpv4().orElse(""));
    }

    @GetMapping("/sessions/{sessionId}/reviews")
    public List<ReviewView> list(@PathVariable String sessionId) {
        return service.list(sessionId).stream().map(ReviewView::from).toList();
    }

    @PostMapping("/reviews/{id}/reissue")
    public ResponseEntity<?> reissue(@PathVariable String id, @RequestBody ReissueReviewRequest request) {
        try {
            var reissued = service.reissue(id, request.expiresInDays());
            return ResponseEntity.ok(Map.of("review", ReviewView.from(reissued.space()),
                    "token", reissued.token(), "sharePath", "/review/" + reissued.token(),
                    "lanIpv4", localNetworkAddress.preferredIpv4().orElse("")));
        } catch (IllegalArgumentException error) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException error) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", error.getMessage()));
        }
    }

    @GetMapping("/sessions/{sessionId}/review-relations")
    public ReviewRelationView relations(@PathVariable String sessionId) {
        return ReviewRelationView.from(service.relationContext(sessionId),
                localNetworkAddress.preferredIpv4().orElse(""));
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
                .map(space -> ResponseEntity.ok(PublicReviewView.from(space, service.sourceTitle(space),
                        service.runtimeConfig(space), service.coveredSourceMessageIds(space),
                        service.hasSubmittedSummary(space))))
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
                    token, request.content(), request.sourceMessageId(), request.coveredSourceMessageIds())));
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
                .map(session -> ResponseEntity.ok(history.readReviewMessages(session.getCwd(), session.getSdkSessionId(),
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
                                      long expiresInDays, String lastTurnId, String codexHome) {}
    public record ReissueReviewRequest(long expiresInDays) {}
    public record ReviewView(String id, String sourceSessionId, String reviewSessionId, String mode,
                             String status, String title, long expiresAt, long createdAt) {
        static ReviewView from(ReviewSpace s) {
            return new ReviewView(s.id(), s.sourceSessionId(), s.reviewSessionId(), s.mode(),
                    s.status(), s.title(), s.expiresAt(), s.createdAt());
        }
    }
    public record ReviewRelationView(String role, String sourceSessionId, String sourceTitle,
                                     List<ReviewSpaceService.ReviewLink> reviews,
                                     List<com.exceptioncoder.toolbox.claudechat.domain.ReviewFeedback> pendingFeedback,
                                     String lanIpv4) {
        static ReviewRelationView from(ReviewSpaceService.RelationContext relation, String lanIpv4) {
            return new ReviewRelationView(relation.role(), relation.sourceSessionId(), relation.sourceTitle(),
                    relation.reviews(), relation.pendingFeedback(), lanIpv4);
        }
    }
    public record PublicReviewView(String reviewSessionId, String title, String sourceTitle, String mode,
                                   String contextSnapshot, long expiresAt, long createdAt,
                                   ReviewSpaceService.ReviewRuntimeConfig runtimeConfig,
                                   List<String> coveredSourceMessageIds, boolean hasSubmittedSummary) {
        static PublicReviewView from(ReviewSpace s, String sourceTitle,
                                     ReviewSpaceService.ReviewRuntimeConfig runtimeConfig,
                                     List<String> coveredSourceMessageIds, boolean hasSubmittedSummary) {
            return new PublicReviewView(s.reviewSessionId(), s.title(), sourceTitle,
                    s.mode(), s.contextSnapshot(), s.expiresAt(), s.createdAt(), runtimeConfig,
                    coveredSourceMessageIds, hasSubmittedSummary);
        }
    }

    public record SubmitFeedbackRequest(String content, String sourceMessageId,
                                        List<String> coveredSourceMessageIds) {}
    public record HandleFeedbackRequest(String status) {}
    public record ReviewFeedbackView(String id, String status, long createdAt) {
        static ReviewFeedbackView from(com.exceptioncoder.toolbox.claudechat.domain.ReviewFeedback feedback) {
            return new ReviewFeedbackView(feedback.id(), feedback.status(), feedback.createdAt());
        }
    }
}
