package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantContextSnapshot;
import com.exceptioncoder.toolbox.assistant.domain.AssistantMessageClassification;
import com.exceptioncoder.toolbox.assistant.repository.AssistantContextSnapshotRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCandidate;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackAttachment;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    public AssistantFeedbackCandidateFactory(AssistantContextSnapshotRepository contextRepository,
                                             ObjectMapper objectMapper) {
        this.contextRepository = contextRepository;
        this.objectMapper = objectMapper;
    }

    /** 构造不含完整上下文和认证凭据的反馈来源。 */
    public FeedbackContext context(long creatorUserId, String sessionId) {
        AssistantContextSnapshot snapshot = contextRepository.findLatest(sessionId).orElse(null);
        if (snapshot == null) {
            return new FeedbackContext(creatorUserId, sessionId, "UNKNOWN", "", "");
        }
        try {
            JsonNode root = objectMapper.readTree(snapshot.snapshotJson());
            return new FeedbackContext(
                    creatorUserId,
                    sessionId,
                    limit(root.path("application").path("appId").asText("UNKNOWN"), MAX_SOURCE_LENGTH),
                    limit(root.path("page").path("url").asText(""), MAX_PAGE_URL_LENGTH),
                    limit(root.path("page").path("title").asText(""), MAX_PAGE_TITLE_LENGTH));
        } catch (Exception exception) {
            throw new IllegalStateException("Assistant 上下文快照无法解析", exception);
        }
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
