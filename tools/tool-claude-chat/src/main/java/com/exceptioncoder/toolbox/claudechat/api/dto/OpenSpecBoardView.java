package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** OpenSpec 项目、需求与任务的只读看板投影。 */
public final class OpenSpecBoardView {

    private OpenSpecBoardView() {
    }

    /** 项目看板集合。 */
    public record BoardList(List<ProjectSummary> projects, Instant snapshotAt) {
    }

    /** 项目及其活动需求摘要。 */
    public record ProjectSummary(String id, String name, ProjectState state, String message,
                                 List<ChangeSummary> changes, Integer completedTasks,
                                 Integer totalTasks, Instant snapshotAt) {
    }

    /** OpenSpec change 摘要。 */
    public record ChangeSummary(String id, String title, ChangeState state, Integer completedTasks,
                                Integer totalTasks, Instant lastModified) {
    }

    /** 单个 change 的任务详情。 */
    public record ChangeDetail(String projectId, String projectName, String changeId, String title,
                               ChangeState state, Integer completedTasks, Integer totalTasks,
                               Map<String, List<String>> artifactPaths, List<Task> tasks,
                               List<AffectedApiEvidence> affectedApis, Instant snapshotAt,
                               Freshness freshness) {
    }

    /** 单个 OpenSpec 任务及其可信状态。 */
    public record Task(String id, String outlineId, String description, String section,
                       TaskState state, RuntimeEvidence runtime) {
    }

    /** 可选的运行时状态证据。 */
    public record RuntimeEvidence(String sessionId, String engine, String phase,
                                  Instant lastActivityAt, String attentionReason) {
    }

    /** 由受监督会话归集到 OpenSpec change 的服务端接口影响证据。 */
    public record AffectedApiEvidence(String sessionId, String httpMethod, String apiPath,
                                      String changeType, String sourceFile, String handlerName,
                                      String summary, String verificationStatus,
                                      String verificationMethod, String verificationSummary,
                                      Instant updatedAt) {
    }

    /** 项目 OpenSpec 可用状态。 */
    public enum ProjectState {
        READY,
        NOT_INITIALIZED,
        TOOL_UNAVAILABLE,
        ERROR
    }

    /** 需求聚合状态。 */
    public enum ChangeState {
        IN_PROGRESS,
        COMPLETE,
        ATTENTION
    }

    /** 看板任务列。 */
    public enum TaskState {
        TODO,
        IN_PROGRESS,
        IN_REVIEW,
        BLOCKED,
        DONE
    }

    /** 快照新鲜度。 */
    public enum Freshness {
        FRESH,
        STALE
    }
}
