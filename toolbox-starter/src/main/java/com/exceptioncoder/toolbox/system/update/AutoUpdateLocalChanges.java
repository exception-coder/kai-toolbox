package com.exceptioncoder.toolbox.system.update;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.UUID;

/** 仅在已构建、排空及最终复核之后调用。恢复失败保留 stash 和持久阻断记录。 */
final class AutoUpdateLocalChanges {
    private static final String JOURNAL = "forge-auto-update-stash.pending";
    private final AutoUpdateRepository repository;
    private final AutoUpdateProperties properties;

    AutoUpdateLocalChanges(AutoUpdateRepository repository, AutoUpdateProperties properties) {
        this.repository = repository;
        this.properties = properties;
    }

    AutoUpdateCommandRunner.Result merge(Path root, String candidate) {
        var journalPath = command(root, "rev-parse", "--git-path", JOURNAL);
        if (!journalPath.success()) return journalPath;
        Path journal = root.resolve(journalPath.stdout().trim()).normalize();
        if (Files.exists(journal)) return failure("存在未完成的暂存恢复记录：" + journal);
        var dirty = command(root, "status", "--porcelain=v1", "--untracked-files=no");
        if (!dirty.success()) return dirty;
        if (dirty.stdout().isBlank()) return fastForward(root, candidate);

        String tag = "forge-auto-update-" + UUID.randomUUID();
        try {
            // 先记录意图，进程中断后禁止重试 stash/恢复，避免重复应用或覆盖现场。
            Files.writeString(journal, "tag=" + tag + "\ncandidate=" + candidate + "\n",
                    StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            var saved = command(root, "stash", "push", "--message", tag);
            if (!saved.success()) return failure("暂存未确认完成；保留记录供恢复：" + journal + "；" + saved.summary());
            var identity = command(root, "log", "-1", "--format=%H%n%s", "refs/stash");
            String[] lines = identity.stdout().split("\\R", 2);
            if (!identity.success() || lines.length != 2 || !lines[0].matches("[0-9a-f]{40,64}") || !lines[1].contains(tag)) {
                return failure("无法确认本次 stash 身份；请按记录核对：" + journal);
            }
            String stash = lines[0];
            Files.writeString(journal, "stash=" + stash + "\n", StandardOpenOption.APPEND);
            var remaining = command(root, "status", "--porcelain=v1", "--untracked-files=no");
            var merged = remaining.success() && remaining.stdout().isBlank()
                    ? fastForward(root, candidate) : failure("暂存后仍有本地改动，未执行快进");
            // 使用不可变对象恢复，保留原 staged/unstaged 区别；不 pop/drop 用户 stash。
            var restored = command(root, "stash", "apply", "--index", stash);
            if (!restored.success()) return failure("本地改动恢复失败，禁止重启；备份 " + stash + "；记录 " + journal + "；" + restored.summary());
            var conflicts = command(root, "ls-files", "--unmerged");
            if (!conflicts.success() || !conflicts.stdout().isBlank()) return failure("恢复存在冲突，禁止重启；备份 " + stash + "；记录 " + journal);
            Files.delete(journal);
            return merged;
        } catch (IOException e) {
            return failure("暂存恢复记录处理失败，禁止重启；保留原生 stash 与现场：" + journal + "；" + e.getMessage());
        }
    }

    private AutoUpdateCommandRunner.Result fastForward(Path root, String candidate) {
        return repository.git(root, properties.getMergeTimeout(),
                List.of("merge", "--ff-only", "--no-edit", "--no-overwrite-ignore", candidate));
    }

    private AutoUpdateCommandRunner.Result command(Path root, String... args) {
        return repository.git(root, properties.getMergeTimeout(), List.of(args));
    }

    private static AutoUpdateCommandRunner.Result failure(String message) {
        return AutoUpdateCommandRunner.Result.failed(message);
    }
}
