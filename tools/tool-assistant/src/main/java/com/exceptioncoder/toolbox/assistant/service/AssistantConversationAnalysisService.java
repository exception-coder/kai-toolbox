package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantConversationAnalysis;
import com.exceptioncoder.toolbox.assistant.domain.AssistantIntent;
import com.exceptioncoder.toolbox.assistant.domain.AssistantIntentResult;
import com.exceptioncoder.toolbox.assistant.domain.AssistantMessageClassification;
import com.exceptioncoder.toolbox.assistant.repository.AssistantConversationAnalysisRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCandidate;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.common.session.SessionOwnershipPort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 编排会话新增用户消息的反馈识别、摘要维护和水位推进。 */
@Service
public class AssistantConversationAnalysisService {

    private static final int MAX_SUMMARY_LENGTH = 6_000;
    private static final int MAX_SUMMARY_ENTRY_LENGTH = 500;
    private static final int LOCK_STRIPES = 64;
    private static final Object[] LOCKS = createLocks();

    private final AssistantConversationAnalysisRepository repository;
    private final AssistantIntentRouter intentRouter;
    private final SessionOwnershipPort sessionOwnership;
    private final AssistantFeedbackCandidateFactory candidateFactory;
    private final AssistantFeedbackDescriptionGenerator descriptionGenerator;
    private final AssistantFeedbackDraftExtractor draftExtractor;
    private final AssistantFeedbackStorePort feedbackStore;

    public AssistantConversationAnalysisService(AssistantConversationAnalysisRepository repository,
                                                AssistantIntentRouter intentRouter,
                                                SessionOwnershipPort sessionOwnership,
                                                AssistantFeedbackCandidateFactory candidateFactory,
                                                AssistantFeedbackDescriptionGenerator descriptionGenerator,
                                                AssistantFeedbackDraftExtractor draftExtractor,
                                                AssistantFeedbackStorePort feedbackStore) {
        this.repository = repository;
        this.intentRouter = intentRouter;
        this.sessionOwnership = sessionOwnership;
        this.candidateFactory = candidateFactory;
        this.descriptionGenerator = descriptionGenerator;
        this.draftExtractor = draftExtractor;
        this.feedbackStore = feedbackStore;
    }

    /** 返回当前认证用户在指定会话上的最后成功水位。 */
    public AssistantCapabilityPort.ConversationAnalysisCursor cursor(String sessionId) {
        requireSessionAccess(sessionId);
        long userId = currentUserId();
        long watermark = repository.find(userId, sessionId)
                .map(AssistantConversationAnalysis::watermark)
                .orElse(0L);
        return new AssistantCapabilityPort.ConversationAnalysisCursor(watermark);
    }

    /** 只分析期望水位之后的新增用户消息，并在成功后推进持久化水位。 */
    @Transactional
    public AssistantCapabilityPort.ConversationAnalysisResult analyze(AnalyzeConversationCommand command) {
        requireSessionAccess(command.sessionId());
        long userId = currentUserId();
        String lockKey = userId + ":" + command.sessionId();
        synchronized (lockFor(lockKey)) {
            AssistantConversationAnalysis current = repository.find(userId, command.sessionId()).orElse(null);
            long currentWatermark = current == null ? 0L : current.watermark();
            String currentSummary = current == null ? "" : current.summary();
            if (currentWatermark != command.fromWatermark()) {
                return result(command.fromWatermark(), currentWatermark, false, false, true,
                        currentSummary, List.of());
            }
            if (command.toWatermark() <= currentWatermark) {
                return result(currentWatermark, currentWatermark, false, command.caughtUp(), false,
                        currentSummary, List.of());
            }

            List<AssistantCapabilityPort.ConversationMessage> increment = normalizeMessages(command, currentWatermark);
            Map<Long, AssistantFeedbackDraftExtractor.ExtractedDraft> responseDrafts =
                    responseDrafts(increment);
            List<AssistantCapabilityPort.ConversationDetection> detections = new ArrayList<>();
            List<FeedbackCandidate> candidates = new ArrayList<>();
            AssistantFeedbackStorePort.FeedbackContext feedbackContext = null;
            String updatedSummary = currentSummary;
            long now = System.currentTimeMillis();
            for (AssistantCapabilityPort.ConversationMessage message : increment) {
                if (!"user".equalsIgnoreCase(message.role())) {
                    continue;
                }
                AssistantFeedbackDraftExtractor.ExtractedDraft responseDraft = responseDrafts.get(message.sequence());
                AssistantMessageClassification routed = responseDraft == null
                        ? intentRouter.classifyFeedbackWithContext(message.content(), updatedSummary)
                        : classification(responseDraft.category());
                detections.add(new AssistantCapabilityPort.ConversationDetection(
                        message.sequence(), routed.intentResult().intent().name(), routed.feedbackCategory().name(),
                        routed.requirementType().name(), routed.intentResult().confidence(),
                        routed.intentResult().reason()));
                if (routed.feedbackCategory() != FeedbackCategory.NONE) {
                    if (feedbackContext == null) {
                        feedbackContext = candidateFactory.context(userId, command.sessionId());
                    }
                    String description = responseDraft == null
                            ? descriptionGenerator.generate(
                                    routed.feedbackCategory(), message.content(), updatedSummary, feedbackContext)
                            : responseDraft.content();
                    candidates.add(candidateFactory.candidate(
                            message.sequence(), message.content(), description,
                            routed, now, message.attachments()));
                    updatedSummary = appendSummary(updatedSummary, message.sequence(),
                            routed.feedbackCategory().name(), message.content());
                }
            }

            if (!candidates.isEmpty()) {
                feedbackStore.saveCandidates(new AssistantFeedbackStorePort.SaveCommand(
                        feedbackContext, candidates));
            }
            repository.upsert(new AssistantConversationAnalysis(
                    current == null ? UUID.randomUUID().toString() : current.id(), userId,
                    command.sessionId(), command.toWatermark(), updatedSummary,
                    current == null ? now : current.createTime(), now));
            return result(currentWatermark, command.toWatermark(), true, command.caughtUp(), false,
                    updatedSummary, List.copyOf(detections));
        }
    }

    private List<AssistantCapabilityPort.ConversationMessage> normalizeMessages(
            AnalyzeConversationCommand command, long currentWatermark) {
        return command.messages().stream()
                .filter(message -> message != null
                        && message.sequence() > currentWatermark
                        && message.sequence() <= command.toWatermark())
                .sorted(Comparator.comparingLong(AssistantCapabilityPort.ConversationMessage::sequence))
                .toList();
    }

    private Map<Long, AssistantFeedbackDraftExtractor.ExtractedDraft> responseDrafts(
            List<AssistantCapabilityPort.ConversationMessage> messages) {
        Map<Long, AssistantFeedbackDraftExtractor.ExtractedDraft> drafts = new HashMap<>();
        AssistantCapabilityPort.ConversationMessage pendingUser = null;
        for (AssistantCapabilityPort.ConversationMessage message : messages) {
            if ("user".equalsIgnoreCase(message.role())) {
                pendingUser = message;
                continue;
            }
            if (pendingUser == null || !"assistant".equalsIgnoreCase(message.role())) {
                continue;
            }
            AssistantCapabilityPort.ConversationMessage source = pendingUser;
            draftExtractor.extract(message.content())
                    .ifPresent(draft -> drafts.put(source.sequence(), draft));
        }
        return Map.copyOf(drafts);
    }

    private AssistantMessageClassification classification(FeedbackCategory category) {
        AssistantIntent intent = category == FeedbackCategory.BUG
                ? AssistantIntent.BUG : AssistantIntent.SUGGESTION;
        RequirementType requirementType = switch (category) {
            case BUG -> RequirementType.BUG_FIX;
            case REQUIREMENT -> RequirementType.NEW_MODULE;
            case OPTIMIZATION -> RequirementType.MODULE_ADJUST;
            case NONE -> RequirementType.UNKNOWN;
        };
        return new AssistantMessageClassification(
                new AssistantIntentResult(intent, 0.99D, "Assistant 回复包含标准反馈草稿"),
                category, requirementType);
    }

    private String appendSummary(String summary, long sequence, String intent, String content) {
        String normalized = content == null ? "" : content.replaceAll("\\s+", " ").trim();
        if (normalized.length() > MAX_SUMMARY_ENTRY_LENGTH) {
            normalized = normalized.substring(0, MAX_SUMMARY_ENTRY_LENGTH) + "…";
        }
        String entry = "- [" + intent + "] #" + sequence + " " + normalized;
        String merged = summary == null || summary.isBlank() ? entry : summary + "\n" + entry;
        return merged.length() <= MAX_SUMMARY_LENGTH
                ? merged : merged.substring(merged.length() - MAX_SUMMARY_LENGTH);
    }

    private AssistantCapabilityPort.ConversationAnalysisResult result(
            long fromWatermark, long toWatermark, boolean advanced, boolean caughtUp, boolean stale,
            String summary, List<AssistantCapabilityPort.ConversationDetection> detections) {
        return new AssistantCapabilityPort.ConversationAnalysisResult(
                fromWatermark, toWatermark, advanced, caughtUp, stale,
                summary == null ? "" : summary, detections);
    }

    private void requireSessionAccess(String sessionId) {
        if (!sessionOwnership.canCurrentUserAccess(sessionId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话");
        }
    }

    private long currentUserId() {
        return AuthContext.current().map(principal -> principal.userId()).orElse(0L);
    }

    private Object lockFor(String key) {
        return LOCKS[Math.floorMod(key.hashCode(), LOCK_STRIPES)];
    }

    private static Object[] createLocks() {
        Object[] locks = new Object[LOCK_STRIPES];
        for (int index = 0; index < locks.length; index++) {
            locks[index] = new Object();
        }
        return locks;
    }

    /** 会话增量分析命令。 */
    public record AnalyzeConversationCommand(String sessionId, long fromWatermark, long toWatermark,
                                             boolean caughtUp,
                                             List<AssistantCapabilityPort.ConversationMessage> messages) {
        public AnalyzeConversationCommand {
            messages = messages == null ? List.of() : List.copyOf(messages);
        }
    }
}
