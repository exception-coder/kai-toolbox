package com.exceptioncoder.toolbox.common.assistant;

import java.util.List;

/**
 * 嵌入式助手通过统一传输层调用的稳定业务能力端口。
 *
 * <p>传输模块只依赖该端口，不直接依赖 tool-assistant 的服务或数据表。</p>
 */
public interface AssistantCapabilityPort {

    IntentResult routeIntent(String mode, String text);

    /**
     * 读取当前用户会话最近一次成功分析的水位。
     *
     * @param sessionId 会话标识
     * @return 持久化分析水位
     */
    ConversationAnalysisCursor conversationAnalysisCursor(String sessionId);

    /**
     * 分析服务端从权威水位后读取的会话增量。
     *
     * @param sessionId 会话标识
     * @param fromWatermark 本批次起始水位
     * @param toWatermark 本批次末端水位
     * @param caughtUp 本批次是否已经追平 transcript
     * @param messages 本批次会话事实
     * @return 识别结果、滚动摘要和新水位
     */
    ConversationAnalysisResult analyzeConversation(String sessionId, long fromWatermark, long toWatermark,
                                                    boolean caughtUp, List<ConversationMessage> messages);

    SnapshotResult saveContext(String sessionId, String protocolVersion, Object snapshot);

    /**
     * 读取当前认证用户的有效模块探索摘要。
     *
     * @param appId 来源应用标识
     * @param moduleKey 稳定模块标识
     * @param route 当前页面路由
     * @param sourceRevision 宿主发布或上下文结构版本
     * @return 命中状态及有效摘要元数据
     */
    ModuleContextResult resolveModuleContext(String appId, String moduleKey, String route, String sourceRevision);

    /**
     * 保存当前认证用户的一份模块探索摘要。
     *
     * @param appId 来源应用标识
     * @param moduleKey 稳定模块标识
     * @param route 当前页面路由
     * @param sourceRevision 宿主发布或上下文结构版本
     * @param summary 已在客户端确定性压缩的摘要
     * @return 保存后的更新时间和失效时间
     */
    ModuleContextSaveResult saveModuleContext(String appId, String moduleKey, String route,
                                              String sourceRevision, String summary);

    DraftResult createDraft(String sessionId, String kind, String title, String description,
                            Object contextSnapshot, Object evidence);

    RegistrationResult confirmDraft(String draftId, String idempotencyKey, Long engineerUserId);

    List<UserOption> listAssignableUsers();

    record IntentResult(String intent, double confidence, String reason) {
    }

    /** 会话分析游标。 */
    record ConversationAnalysisCursor(long watermark) {
    }

    /** 服务端读取的一条会话事实。 */
    record ConversationMessage(long sequence, String role, String content,
                               List<ConversationAttachment> attachments) {
        public ConversationMessage(long sequence, String role, String content) {
            this(sequence, role, content, List.of());
        }

        public ConversationMessage {
            attachments = attachments == null ? List.of() : List.copyOf(attachments);
        }
    }

    /** 已落盘且归属于该用户轮次的附件安全元数据。 */
    record ConversationAttachment(String id, String name, String mime, long size) {
    }

    /** 一条新增用户消息的受控意图和反馈分类结果。 */
    record ConversationDetection(long sourceWatermark, String intent, String feedbackCategory,
                                 String requirementType, double confidence, String reason) {
    }

    /** 会话增量分析结果。 */
    record ConversationAnalysisResult(long fromWatermark, long toWatermark, boolean advanced,
                                      boolean caughtUp, boolean stale, String summary,
                                      List<ConversationDetection> detections) {
    }

    record SnapshotResult(String snapshotId, long capturedAt) {
    }

    /**
     * 模块探索摘要读取结果。
     *
     * @param found 是否命中有效摘要
     * @param summary 命中的历史探索摘要
     * @param sourceRevision 摘要对应的宿主版本
     * @param updatedAt 摘要最后更新时间
     * @param expiresAt 摘要失效时间
     */
    record ModuleContextResult(boolean found, String summary, String sourceRevision,
                               Long updatedAt, Long expiresAt) {
    }

    /**
     * 模块探索摘要保存结果。
     *
     * @param moduleKey 稳定模块标识
     * @param updatedAt 摘要最后更新时间
     * @param expiresAt 摘要失效时间
     */
    record ModuleContextSaveResult(String moduleKey, long updatedAt, long expiresAt) {
    }

    record DraftResult(String draftId, String status) {
    }

    record RegistrationResult(String draftId, String requirementId, String status, boolean alreadySaved) {
    }

    record UserOption(long userId, String username, String displayName) {
    }
}
