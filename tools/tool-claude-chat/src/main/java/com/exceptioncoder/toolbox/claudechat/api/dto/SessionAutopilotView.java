package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** 会话自动监督的 REST 与 WebSocket 展示契约。 */
public final class SessionAutopilotView {

    private SessionAutopilotView() {
    }

    public record ChangeOption(String id, int completedTasks, int totalTasks, String lastModified) {
    }

    public record Run(
            String id,
            String sessionId,
            String goal,
            String completionPolicy,
            String state,
            String reason,
            String phase,
            String projectRoot,
            String repositoryIdentity,
            String branchAtStart,
            String workspaceFingerprint,
            String changeId,
            String changeRevision,
            String currentTaskId,
            Integer currentTaskOrdinal,
            String agentSessionRef,
            long generation,
            long version,
            int turnCount,
            int maxTurns,
            int noProgressCount,
            int maxNoProgress,
            boolean autoArchive,
            LayerStatus layers,
            Progress progress,
            Report latestReport,
            Map<String, List<String>> artifactPaths,
            Instant startedAt,
            Instant deadlineAt,
            Instant updatedAt) {
    }

    public record LayerStatus(boolean agentSkillProvisioned, boolean agentSkillActivated,
                              String skillPath, String skillVersion, String skillFingerprint,
                              boolean forgeRuntimeActive) {
    }

    public record Progress(int completedTasks, int totalTasks) {
    }

    public record Report(String disposition, String summary, String nextAction,
                         List<String> remainingWork, List<String> evidence, Instant reportedAt) {
    }

    public record DashboardItem(
            Run run,
            String sessionTitle,
            String projectName,
            String engine,
            String sessionStatus,
            long lastActivityAt) {
    }

    public record Dashboard(List<DashboardItem> items, Counts counts, String nextCursor,
                            Instant snapshotAt) {
    }

    public record Counts(long active, long attention, long paused, long recent) {
    }
}
