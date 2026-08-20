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

    DraftResult createDraft(String sessionId, String kind, String title, String description,
                            Object contextSnapshot, Object evidence);

    RegistrationResult confirmDraft(String draftId, String idempotencyKey, Long engineerUserId);

    List<UserOption> listAssignableUsers();

    record IntentResult(String intent, double confidence, String reason) {
    }

    record SnapshotResult(String snapshotId, long capturedAt) {
    }

    record DraftResult(String draftId, String status) {
    }

    record RegistrationResult(String draftId, String requirementId, String status, boolean alreadySaved) {
    }

    record UserOption(long userId, String username, String displayName) {
    }
}
