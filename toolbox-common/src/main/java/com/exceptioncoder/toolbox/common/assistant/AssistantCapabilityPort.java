package com.exceptioncoder.toolbox.common.assistant;

import java.util.List;

/**
 * 嵌入式助手通过统一传输层调用的稳定业务能力端口。
 *
 * <p>传输模块只依赖该端口，不直接依赖 tool-assistant 的服务或数据表。</p>
 */
public interface AssistantCapabilityPort {

    IntentResult routeIntent(String mode, String text);

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
