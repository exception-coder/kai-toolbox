package com.exceptioncoder.toolbox.common.assistant;

import com.exceptioncoder.toolbox.common.requirement.RequirementType;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Assistant 反馈候选写入外部共享数据库的稳定端口。 */
public interface AssistantFeedbackStorePort {

    /**
     * 幂等保存一次会话增量中识别出的反馈候选。
     *
     * @param command 来源上下文和候选集合
     * @throws RuntimeException 外部存储不可用或写入失败
     */
    void saveCandidates(SaveCommand command);

    Map<String, FeedbackCounts> summarizeCandidates(long creatorUserId, List<String> sessionIds);

    CandidatePage listCandidates(CandidateQuery query);

    RevisionPage listRevisions(RevisionQuery query);

    FeedbackCandidateView updateCandidate(UpdateCandidateCommand command);

    Optional<FeedbackAttachment> findCandidateAttachment(long creatorUserId, String sessionId,
                                                         String candidateId, String attachmentId);

    /** 编辑时发现客户端版本已落后，调用方应刷新后再提交。 */
    final class ConcurrentFeedbackUpdateException extends RuntimeException {
        public ConcurrentFeedbackUpdateException() {
            super("反馈记录已被更新，请刷新后重试");
        }
    }

    /** 可持久化的用户反馈分类。 */
    enum FeedbackCategory {
        /** 已有功能行为不符合预期。 */
        BUG,
        /** 用户提出此前不存在的新能力。 */
        REQUIREMENT,
        /** 用户要求调整或改善已有能力。 */
        OPTIMIZATION,
        /** 非反馈消息，不进入候选库。 */
        NONE
    }

    /**
     * 一次候选写入命令。
     *
     * @param context 认证用户和来源页面上下文
     * @param candidates 同一分析批次的候选集合
     */
    record SaveCommand(FeedbackContext context, List<FeedbackCandidate> candidates) {
        public SaveCommand {
            candidates = candidates == null ? List.of() : List.copyOf(candidates);
        }
    }

    /**
     * 反馈来源上下文。
     *
     * @param creatorUserId Forge 认证用户标识
     * @param sessionId 来源会话标识
     * @param sourceSystem 来源应用稳定标识
     * @param pageUrl 来源页面 URL
     * @param pageTitle 来源页面标题
     */
    record FeedbackContext(long creatorUserId, String sessionId, String sourceSystem,
                           String pageUrl, String pageTitle) {
    }

    /**
     * 单条用户消息对应的反馈候选。
     *
     * @param id 候选标识
     * @param sourceWatermark 来源消息水位
     * @param category 反馈分类
     * @param requirementType 对应需求池类型
     * @param sourceContent 限长后的用户反馈原话
     * @param content AI 规范稿或当前用户修订正文
     * @param confidence 分类置信度
     * @param reason 分类依据
     * @param detectedAt 识别时间
     */
    record FeedbackCandidate(String id, long sourceWatermark, FeedbackCategory category,
                             RequirementType requirementType, String sourceContent, String content,
                             double confidence,
                             String reason, long detectedAt, List<FeedbackAttachment> attachments) {
        public FeedbackCandidate(String id, long sourceWatermark, FeedbackCategory category,
                                 RequirementType requirementType, String content, double confidence,
                                 String reason, long detectedAt) {
            this(id, sourceWatermark, category, requirementType, content, content, confidence, reason,
                    detectedAt, List.of());
        }

        public FeedbackCandidate(String id, long sourceWatermark, FeedbackCategory category,
                                 RequirementType requirementType, String content, double confidence,
                                 String reason, long detectedAt, List<FeedbackAttachment> attachments) {
            this(id, sourceWatermark, category, requirementType, content, content, confidence, reason,
                    detectedAt, attachments);
        }

        public FeedbackCandidate {
            attachments = attachments == null ? List.of() : List.copyOf(attachments);
        }
    }

    record FeedbackAttachment(String id, String name, String mime, long size) {
    }

    record FeedbackCounts(long bug, long optimization, long requirement) {
        public static FeedbackCounts empty() {
            return new FeedbackCounts(0, 0, 0);
        }
    }

    record CandidateQuery(long creatorUserId, String sessionId, FeedbackCategory category,
                          Long beforeDetectedAt, String beforeId, int limit) {
    }

    record CandidatePage(List<FeedbackCandidateView> items, boolean hasMore) {
        public CandidatePage {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    record FeedbackCandidateView(String id, String sessionId, long sourceWatermark,
                                 FeedbackCategory category, RequirementType requirementType,
                                 String sourceContent, String content, double confidence, String reason,
                                 String pageUrl, String pageTitle, String status,
                                 long detectedAt, long updateTime, int revisionNo,
                                 FeedbackRevision aiOriginal, List<FeedbackAttachment> attachments) {
        public FeedbackCandidateView {
            attachments = attachments == null ? List.of() : List.copyOf(attachments);
        }
    }

    record RevisionQuery(long creatorUserId, String sessionId, String candidateId,
                         Integer beforeRevisionNo, int limit) {
    }

    record RevisionPage(List<FeedbackRevision> items, boolean hasMore) {
        public RevisionPage {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    record FeedbackRevision(int revisionNo, String source, Long editorUserId,
                            FeedbackCategory category, RequirementType requirementType,
                            String content, long createdAt) {
    }

    record UpdateCandidateCommand(long creatorUserId, String sessionId, String candidateId,
                                  FeedbackCategory category, RequirementType requirementType,
                                  String content, long expectedUpdateTime, long editedAt) {
    }
}
