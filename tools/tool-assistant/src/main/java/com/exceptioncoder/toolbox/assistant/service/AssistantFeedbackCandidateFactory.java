package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantContextSnapshot;
import com.exceptioncoder.toolbox.assistant.domain.AssistantMessageClassification;
import com.exceptioncoder.toolbox.assistant.repository.AssistantContextSnapshotRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCandidate;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackAttachment;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackContext;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.List;

/** 从受控分类结果和最近上下文构造限长的公网反馈候选。 */
@Component
public class AssistantFeedbackCandidateFactory {

    private static final int MAX_CONTENT_LENGTH = 8_000;
    private static final int MAX_REASON_LENGTH = 255;
    private static final int MAX_SOURCE_LENGTH = 64;
    private static final int MAX_PAGE_URL_LENGTH = 1_000;
    private static final int MAX_PAGE_TITLE_LENGTH = 255;

    private final AssistantContextSnapshotRepository contextRepository;
    private final ObjectMapper objectMapper;
    private final ObjectProvider<AuthUserService> authUserService;

    public AssistantFeedbackCandidateFactory(AssistantContextSnapshotRepository contextRepository,
                                             ObjectMapper objectMapper,
                                             ObjectProvider<AuthUserService> authUserService) {
        this.contextRepository = contextRepository;
        this.objectMapper = objectMapper;
        this.authUserService = authUserService;
    }

    /** 构造不含完整上下文和认证凭据的反馈来源。 */
    public FeedbackContext context(long creatorUserId, String sessionId) {
        AssistantContextSnapshot snapshot = contextRepository.findLatest(sessionId).orElse(null);
        String creatorUserName = creatorUserName(creatorUserId);
        if (snapshot == null) {
            return new FeedbackContext(creatorUserId, creatorUserName, sessionId, "UNKNOWN", "", "");
        }
        try {
            JsonNode root = objectMapper.readTree(snapshot.snapshotJson());
            return new FeedbackContext(
                    creatorUserId,
                    creatorUserName,
                    sessionId,
                    limit(root.path("application").path("appId").asText("UNKNOWN"), MAX_SOURCE_LENGTH),
                    limit(root.path("page").path("url").asText(""), MAX_PAGE_URL_LENGTH),
                    limit(root.path("page").path("title").asText(""), MAX_PAGE_TITLE_LENGTH));
        } catch (Exception exception) {
            throw new IllegalStateException("Assistant 上下文快照无法解析", exception);
        }
    }

    private String creatorUserName(long creatorUserId) {
        AuthUserService users = authUserService.getIfAvailable();
        if (users != null) {
            var user = users.getById(creatorUserId);
            if (user.getRealName() != null && !user.getRealName().isBlank()) {
                return limit(user.getRealName(), MAX_PAGE_TITLE_LENGTH);
            }
            if (user.getUsername() != null && !user.getUsername().isBlank()) {
                return limit(user.getUsername(), MAX_PAGE_TITLE_LENGTH);
            }
        }
        return AuthContext.current()
                .map(principal -> limit(principal.username(), MAX_PAGE_TITLE_LENGTH))
                .orElse("");
    }

    /** 将单条新增用户消息映射为幂等存储候选。 */
    public FeedbackCandidate candidate(long sourceWatermark, String content,
                                       AssistantMessageClassification classification, long detectedAt) {
        return candidate(sourceWatermark, content, content, classification, detectedAt, List.of());
    }

    /** 将消息及其已落盘附件共同映射为反馈候选。 */
    public FeedbackCandidate candidate(long sourceWatermark, String sourceContent, String description,
                                       AssistantMessageClassification classification, long detectedAt,
                                       List<AssistantCapabilityPort.ConversationAttachment> attachments) {
        return new FeedbackCandidate(
                UUID.randomUUID().toString(),
                sourceWatermark,
                classification.feedbackCategory(),
                classification.requirementType(),
                limit(sourceContent, MAX_CONTENT_LENGTH),
                limit(description, MAX_CONTENT_LENGTH),
                classification.intentResult().confidence(),
                limit(classification.intentResult().reason(), MAX_REASON_LENGTH),
                detectedAt,
                attachments == null ? List.of() : attachments.stream()
                        .map(attachment -> new FeedbackAttachment(
                                attachment.id(), attachment.name(), attachment.mime(), attachment.size()))
                        .toList());
    }

    private String limit(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }
}
