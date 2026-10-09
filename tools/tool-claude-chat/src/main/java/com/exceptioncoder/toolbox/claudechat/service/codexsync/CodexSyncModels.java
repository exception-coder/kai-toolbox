package com.exceptioncoder.toolbox.claudechat.service.codexsync;

import java.util.List;

/** Native metadata projection; contains neither credentials nor copied conversation bodies. */
public final class CodexSyncModels {
    private CodexSyncModels() { }

    public record Project(String id, String name, List<String> roots) { }
    public record Thread(String id, String title, String cwd, String projectId, String model,
                         String reasoningEffort, long createdAt, long updatedAt, String source) { }
    public record ProjectPage(String codexHome, List<Project> data, String nextCursor, long fetchedAt) { }
    public record ThreadView(Thread thread, String importedSessionId, String unavailableReason) { }
    public record ThreadPage(String codexHome, String previewToken, List<ThreadView> data,
                             String nextCursor, Project project, String projectMatch, long fetchedAt) { }
    public record ImportRequest(String previewToken, List<String> threadIds) { }
    public record ImportedSession(String sessionId, String threadId, String title) { }
    public record ImportResult(int added, int reused, List<ImportedSession> sessions) { }
}
