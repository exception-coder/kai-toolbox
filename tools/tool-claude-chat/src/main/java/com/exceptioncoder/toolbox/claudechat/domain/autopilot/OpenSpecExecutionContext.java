package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

/**
 * 会话绑定的 OpenSpec 执行身份。
 * currentTaskId 是 tasks.md 中的人类编号，currentTaskOrdinal 是 apply JSON 的稳定序号。
 */
public record OpenSpecExecutionContext(
        String projectRoot,
        String repositoryIdentity,
        String branchAtStart,
        String workspaceFingerprint,
        String changeId,
        String changeRevision,
        String currentTaskId,
        Integer currentTaskOrdinal,
        OpenSpecExecutionPhase phase,
        String agentSessionRef,
        long generation,
        long version) {

    public OpenSpecExecutionContext {
        if (projectRoot == null || projectRoot.isBlank()) {
            throw new IllegalArgumentException("OpenSpec 项目目录不能为空");
        }
        if (changeId == null || changeId.isBlank()) {
            throw new IllegalArgumentException("OpenSpec change 不能为空");
        }
        if (phase == null) {
            throw new IllegalArgumentException("OpenSpec 执行阶段不能为空");
        }
        if (generation < 1 || version < 0) {
            throw new IllegalArgumentException("OpenSpec 执行版本不合法");
        }
        if ((currentTaskId == null) != (currentTaskOrdinal == null)) {
            throw new IllegalArgumentException("OpenSpec 任务编号与 apply 序号必须同时存在或同时为空");
        }
    }

    public OpenSpecExecutionContext withTask(String taskId, Integer ordinal, String revision) {
        return new OpenSpecExecutionContext(projectRoot, repositoryIdentity, branchAtStart, workspaceFingerprint,
                changeId, revision, taskId, ordinal, phase, agentSessionRef, generation, version + 1);
    }

    public OpenSpecExecutionContext advance(OpenSpecExecutionPhase nextPhase, String revision) {
        if (nextPhase.ordinal() < phase.ordinal()) {
            throw new IllegalArgumentException("OpenSpec 阶段不能逆向推进");
        }
        return new OpenSpecExecutionContext(projectRoot, repositoryIdentity, branchAtStart, workspaceFingerprint,
                changeId, revision, null, null, nextPhase, agentSessionRef, generation, version + 1);
    }
}
