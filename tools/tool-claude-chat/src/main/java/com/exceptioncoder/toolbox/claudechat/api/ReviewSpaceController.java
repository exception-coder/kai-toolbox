package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.LocalNetworkAddressService;
import com.exceptioncoder.toolbox.claudechat.service.ReviewDeletionService;
import com.exceptioncoder.toolbox.claudechat.service.ReviewEnvironmentService;
import com.exceptioncoder.toolbox.claudechat.service.ReviewRequirementService;
import com.exceptioncoder.toolbox.claudechat.service.ReviewIntentService;
import com.exceptioncoder.toolbox.claudechat.service.ReviewPublicMessageProjector;
import com.exceptioncoder.toolbox.claudechat.service.ReviewSpaceService;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
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
    private final ReviewDeletionService deletionService;
    private final ReviewRequirementService requirementService;
    private final ReviewEnvironmentService environmentService;
    private final ReviewIntentService intentService;
    private final AttachmentStorageService attachments;
    private final SessionHistoryService history;
    private final ClaudeChatSessionRepository sessions;
    private final LocalNetworkAddressService localNetworkAddress;

    public ReviewSpaceController(ReviewSpaceService service, ReviewDeletionService deletionService,
                                 ReviewRequirementService requirementService,
                                 ReviewIntentService intentService,
                                 ReviewEnvironmentService environmentService,
                                 AttachmentStorageService attachments,
                                 SessionHistoryService history, ClaudeChatSessionRepository sessions,
                                 LocalNetworkAddressService localNetworkAddress) {
        this.service = service;
        this.deletionService = deletionService;
        this.requirementService = requirementService;
        this.intentService = intentService;
        this.environmentService = environmentService;
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

    @DeleteMapping("/reviews/{id}/record")
    public ResponseEntity<Void> deleteRecord(@PathVariable String id) {
        deletionService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/reviews/public/{token}")
    public ResponseEntity<PublicReviewView> publicView(@PathVariable String token) {
        return service.resolve(token)
                .map(space -> ResponseEntity.ok(PublicReviewView.from(space, service.sourceTitle(space),
                        service.coveredSourceMessageIds(space), service.hasSubmittedSummary(space),
                        service.latestSubmittedSummarySourceId(space))))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/reviews/public/{token}/environment-check")
    public ResponseEntity<ReviewEnvironmentService.Assessment> environmentCheck(@PathVariable String token) {
        return service.resolve(token)
                .map(space -> ResponseEntity.ok(environmentService.assess(space.reviewSessionId())))
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

    @GetMapping("/reviews/public/{token}/requirements")
    public List<ReviewRequirementView> requirements(@PathVariable String token) {
        return requirementService.list(token).stream().map(ReviewRequirementView::from).toList();
    }

    @PutMapping("/reviews/public/{token}/requirements/sync")
    public List<ReviewRequirementView> synchronizeRequirements(
            @PathVariable String token, @RequestBody SyncRequirementsRequest request) {
        List<ReviewRequirementService.DraftCommand> commands = request.items() == null ? null
                : request.items().stream()
                .map(item -> new ReviewRequirementService.DraftCommand(
                        item.sourceMessageId(), item.title(), item.content()))
                .toList();
        return requirementService.synchronize(token, commands).stream()
                .map(ReviewRequirementView::from).toList();
    }

    @PutMapping("/reviews/public/{token}/requirements/{id}")
    public ReviewRequirementView updateRequirement(
            @PathVariable String token, @PathVariable String id,
            @RequestBody UpdateRequirementRequest request) {
        return ReviewRequirementView.from(requirementService.update(token, id,
                new ReviewRequirementService.UpdateCommand(
                        request.title(), request.content(), request.expectedRevision())));
    }

    @DeleteMapping("/reviews/public/{token}/requirements/{id}")
    public ResponseEntity<Void> deleteRequirement(@PathVariable String token, @PathVariable String id) {
        requirementService.delete(token, id);
        return ResponseEntity.noContent().build();
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
        var intents = intentService.list(space.id());
        return sessions.findById(space.reviewSessionId())
                .map(session -> {
                    MessagePage page = history.readReviewMessages(session.getCwd(), session.getSdkSessionId(),
                            session.getCodexHome(), before, limit);
                    List<ChatMessageView> items = ReviewPublicMessageProjector.projectHistory(
                            ReviewIntentHistoryMapper.attach(page.items(), intents));
                    return ResponseEntity.ok(new MessagePage(items, page.nextBefore(), page.transcriptMissing()));
                })
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
                                   List<String> coveredSourceMessageIds, boolean hasSubmittedSummary,
                                   String latestSubmittedSummarySourceId) {
        static PublicReviewView from(ReviewSpace s, String sourceTitle,
                                     List<String> coveredSourceMessageIds, boolean hasSubmittedSummary,
                                     String latestSubmittedSummarySourceId) {
            return new PublicReviewView(s.reviewSessionId(), s.title(), sourceTitle,
                    s.mode(), s.contextSnapshot(), s.expiresAt(), s.createdAt(), coveredSourceMessageIds,
                    hasSubmittedSummary, latestSubmittedSummarySourceId);
        }
    }

    public record SubmitFeedbackRequest(String content, String sourceMessageId,
                                        List<String> coveredSourceMessageIds) {}
    public record RequirementDraftRequest(String sourceMessageId, String title, String content) {}
    public record SyncRequirementsRequest(List<RequirementDraftRequest> items) {}
    public record UpdateRequirementRequest(String title, String content, long expectedRevision) {}
    public record ReviewRequirementView(String id, String sourceMessageId, String title, String content,
                                        long revision, long createdAt, long updatedAt) {
        static ReviewRequirementView from(
                com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement requirement) {
            return new ReviewRequirementView(requirement.id(), requirement.sourceMessageId(),
                    requirement.title(), requirement.content(), requirement.revision(),
                    requirement.createdAt(), requirement.updatedAt());
        }
    }
    public record HandleFeedbackRequest(String status) {}
    public record ReviewFeedbackView(String id, String status, long createdAt) {
        static ReviewFeedbackView from(com.exceptioncoder.toolbox.claudechat.domain.ReviewFeedback feedback) {
            return new ReviewFeedbackView(feedback.id(), feedback.status(), feedback.createdAt());
        }
    }
}
