package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.common.git.GitPullOperations;
import com.exceptioncoder.toolbox.common.git.GitPullPreview;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitCommand;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitPullReader;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.Duration;

/** 检查上游并在确认后快进；不自动隐藏本地改动或处理分叉。 */
@Service
public class ProjectGitPullService implements GitPullOperations {
    private final ProjectGitPullReader reader;
    private final ProjectGitCommand command;
    private final ProjectGitMutationLock mutations;

    public ProjectGitPullService(ProjectGitPullReader reader, ProjectGitCommand command,
                                 ProjectGitMutationLock mutations) {
        this.reader = reader;
        this.command = command;
        this.mutations = mutations;
    }

    @Override
    public GitPullPreview prepare(Path repository) {
        Path root = mutations.canonicalRoot(repository);
        return mutations.execute(root, () -> {
            var target = reader.target(root);
            command.run(root, Duration.ofSeconds(60), "fetch", "--no-tags", "--no-recurse-submodules", "--",
                    target.url(), "+" + target.remoteRef() + ":" + target.trackingRef()).requireSuccess();
            var current = reader.target(root);
            if (!target.equals(current)) {
                throw new IllegalArgumentException("检查期间分支或上游配置已变化，请重新检查");
            }
            return reader.snapshot(root, current);
        });
    }

    @Override
    public String pull(Path repository, String token) {
        Path root = mutations.canonicalRoot(repository);
        return mutations.execute(root, () -> {
            var target = reader.target(root);
            var snapshot = reader.snapshot(root, target);
            if (token == null || !token.equals(snapshot.token())) {
                throw new IllegalArgumentException("分支、提交或上游版本已变化，请重新检查后确认拉取");
            }
            if (!snapshot.pullBlockedReason().isEmpty()) {
                throw new IllegalArgumentException(snapshot.pullBlockedReason());
            }
            command.run(root, Duration.ofSeconds(60), "merge", "--ff-only", "--no-autostash", "--no-edit", "--no-overwrite-ignore",
                    snapshot.upstreamHead()).requireSuccess();
            var after = reader.target(root);
            if (!after.branch().equals(target.branch()) || !after.head().equals(snapshot.upstreamHead())) {
                throw new IllegalStateException("拉取后仓库状态已变化，请先核对当前分支和文件再继续");
            }
            return "拉取成功，已快进 " + snapshot.behind() + " 个提交至 " + after.head().substring(0, 8);
        });
    }
}
