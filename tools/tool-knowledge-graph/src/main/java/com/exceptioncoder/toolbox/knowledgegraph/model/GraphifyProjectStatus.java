package com.exceptioncoder.toolbox.knowledgegraph.model;

import java.time.Instant;

/**
 * @param graphGeneratedAt {@code graphify-out/} 内最新文件的 mtime；{@link GraphifyGraphState#NOT_GENERATED} 时为 null
 * @param latestCommitAt   目标项目最新 git commit 时间；非 git 仓库或命令失败时为 null
 */
public record GraphifyProjectStatus(
        GraphifyGraphState state,
        Instant graphGeneratedAt,
        Instant latestCommitAt,
        Instant checkedAt
) {
}
