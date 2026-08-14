package com.exceptioncoder.toolbox.system.update;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/** Git 工作区安全检查与不可变 SHA 快进。任何不确定状态都返回阻断，不修复用户工作区。 */
@Component
public class AutoUpdateRepository {

    private static final Pattern REMOTE_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");
    private static final Pattern SHA = Pattern.compile("[0-9a-fA-F]{40,64}");
    private static final List<String> OPERATION_MARKERS = List.of(
            "index.lock", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG",
            "sequencer", "rebase-apply", "rebase-merge");
    private static final Map<String, String> NON_INTERACTIVE_GIT = Map.of(
            "GIT_TERMINAL_PROMPT", "0",
            "GCM_INTERACTIVE", "Never");

    private final AutoUpdateProperties properties;
    private final AutoUpdateCommandRunner runner;

    public AutoUpdateRepository(AutoUpdateProperties properties, AutoUpdateCommandRunner runner) {
        this.properties = properties;
        this.runner = runner;
    }

    public Path resolveRoot() {
        String configured = properties.getRepository();
        if (!configured.isBlank()) {
            Path path = Path.of(configured);
            if (!path.isAbsolute()) path = Path.of(System.getProperty("user.dir")).resolve(path);
            return canonical(path);
        }
        Path fromWorkingDirectory = findRoot(Path.of(System.getProperty("user.dir")));
        if (fromWorkingDirectory != null) return fromWorkingDirectory;
        try {
            URI location = AutoUpdateRepository.class.getProtectionDomain().getCodeSource().getLocation().toURI();
            Path code = Path.of(location);
            Path start = Files.isDirectory(code) ? code : code.getParent();
            Path fromCode = findRoot(start);
            if (fromCode != null) return fromCode;
        } catch (Exception ignore) {
            // 后续以明确 unavailable 状态上报。
        }
        return canonical(Path.of(System.getProperty("user.dir")));
    }

    public Validation validateConfiguration() {
        String remote = properties.getRemote();
        String branch = properties.getBranch();
        if (!REMOTE_NAME.matcher(remote).matches() || remote.startsWith("-") || remote.contains("..")) {
            return new Validation(false, "remote 配置不合法");
        }
        if (branch.isBlank() || branch.startsWith("-") || branch.contains("..")
                || branch.contains(" ") || branch.contains("~") || branch.contains("^")
                || branch.contains(":") || branch.contains("?") || branch.contains("*")
                || branch.contains("[") || branch.endsWith("/") || branch.endsWith(".")) {
            return new Validation(false, "branch 配置不合法");
        }
        return new Validation(true, "ok");
    }

    public AutoUpdateCommandRunner.Result fetch(Path root) {
        String remote = properties.getRemote();
        String branch = properties.getBranch();
        String refspec = "+refs/heads/" + branch + ":refs/remotes/" + remote + "/" + branch;
        return git(root, properties.getFetchTimeout(), List.of(
                "fetch", "--no-tags", "--", remote, refspec));
    }

    public RepositoryState inspect(Path root) {
        if (!Files.isDirectory(root) || !Files.exists(root.resolve(".git")) || !Files.isRegularFile(root.resolve("pom.xml"))) {
            return blocked(Disposition.UNAVAILABLE, "未找到 kai-toolbox Git 工作区", null, null);
        }
        Validation config = validateConfiguration();
        if (!config.valid()) return blocked(Disposition.INVALID_CONFIGURATION, config.message(), null, null);

        OperationCheck operation = activeOperation(root);
        if (operation.error() != null) {
            return blocked(Disposition.ERROR, "无法确认 Git 操作状态：" + operation.error(), null, null);
        }
        if (operation.marker() != null) {
            return blocked(Disposition.OPERATION_IN_PROGRESS,
                    "Git 操作进行中：" + operation.marker(), null, null);
        }

        AutoUpdateCommandRunner.Result branchResult = git(root, properties.getCommandTimeout(),
                List.of("symbolic-ref", "--quiet", "--short", "HEAD"));
        if (!branchResult.success()) {
            if (branchResult.exitCode() == 1 && !branchResult.timedOut() && branchResult.launchError() == null) {
                return blocked(Disposition.DETACHED, "当前 HEAD 处于 detached 状态", null, null);
            }
            return blocked(Disposition.ERROR, "读取当前分支失败：" + branchResult.summary(), null, null);
        }
        String currentBranch = branchResult.stdout().trim();
        if (!properties.getBranch().equals(currentBranch)) {
            return blocked(Disposition.WRONG_BRANCH,
                    "当前分支为 " + currentBranch + "，期望 " + properties.getBranch(), null, null);
        }

        AutoUpdateCommandRunner.Result upstreamResult = git(root, properties.getCommandTimeout(),
                List.of("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"));
        String expectedUpstream = properties.getRemote() + "/" + properties.getBranch();
        if (!upstreamResult.success()) {
            String detail = (upstreamResult.stderr() + " " + upstreamResult.stdout()).toLowerCase(Locale.ROOT);
            boolean explicitlyMissing = !upstreamResult.timedOut() && upstreamResult.launchError() == null
                    && (detail.contains("no upstream") || detail.contains("no tracking information"));
            if (!explicitlyMissing) {
                return blocked(Disposition.ERROR, "读取 upstream 失败：" + upstreamResult.summary(), null, null);
            }
            return blocked(Disposition.WRONG_UPSTREAM,
                    "当前分支未配置 upstream，期望 " + expectedUpstream, null, null);
        }
        if (!expectedUpstream.equals(upstreamResult.stdout().trim())) {
            String actual = upstreamResult.stdout().trim();
            return blocked(Disposition.WRONG_UPSTREAM,
                    "当前 upstream 为 " + actual + "，期望 " + expectedUpstream, null, null);
        }

        AutoUpdateCommandRunner.Result status = git(root, properties.getCommandTimeout(),
                List.of("status", "--porcelain=v2", "--untracked-files=all"));
        if (!status.success()) return blocked(Disposition.ERROR, "读取工作区状态失败：" + status.summary(), null, null);
        if (!status.stdout().isBlank()) return blocked(Disposition.DIRTY, "工作区存在未提交或未跟踪文件", null, null);

        RefResult localRef = revParse(root, "HEAD");
        RefResult remoteRef = revParse(root, "refs/remotes/" + expectedUpstream);
        String local = localRef.value();
        String remote = remoteRef.value();
        if (local == null || remote == null) {
            String detail = localRef.error() != null ? localRef.error() : remoteRef.error();
            return blocked(Disposition.ERROR, "无法解析本地或远端提交 SHA：" + detail, local, remote);
        }
        if (local.equals(remote)) return new RepositoryState(Disposition.UP_TO_DATE, "已是最新版本", local, remote);
        AncestorResult localToRemote = isAncestor(root, local, remote);
        if (localToRemote == AncestorResult.ERROR) {
            return blocked(Disposition.ERROR, "无法比较本地与远端提交关系", local, remote);
        }
        if (localToRemote == AncestorResult.YES) {
            return new RepositoryState(Disposition.BEHIND, "检测到可快进更新", local, remote);
        }
        AncestorResult remoteToLocal = isAncestor(root, remote, local);
        if (remoteToLocal == AncestorResult.ERROR) {
            return blocked(Disposition.ERROR, "无法比较远端与本地提交关系", local, remote);
        }
        if (remoteToLocal == AncestorResult.YES) {
            return blocked(Disposition.AHEAD, "本地包含尚未推送的提交，跳过自动更新", local, remote);
        }
        return blocked(Disposition.DIVERGED, "本地与远端已分叉，需人工处理", local, remote);
    }

    public AutoUpdateCommandRunner.Result mergeImmutable(Path root, String candidateSha) {
        if (!validSha(candidateSha)) return AutoUpdateCommandRunner.Result.failed("候选 SHA 不合法");
        return git(root, properties.getMergeTimeout(), List.of("merge", "--ff-only", "--no-edit", candidateSha));
    }

    public AutoUpdateCommandRunner.Result addDetachedWorktree(Path root, Path stage, String candidateSha) {
        if (!validSha(candidateSha)) return AutoUpdateCommandRunner.Result.failed("候选 SHA 不合法");
        return git(root, properties.getBuildTimeout(),
                List.of("worktree", "add", "--detach", stage.toAbsolutePath().toString(), candidateSha));
    }

    public AutoUpdateCommandRunner.Result removeWorktree(Path root, Path stage) {
        if (stage == null || !stage.isAbsolute()) {
            return AutoUpdateCommandRunner.Result.failed("worktree 路径必须是绝对路径");
        }
        return git(root, properties.getCleanupTimeout(),
                List.of("worktree", "remove", "--force", stage.normalize().toString()));
    }

    public AutoUpdateCommandRunner.Result pruneWorktrees(Path root) {
        return git(root, properties.getCleanupTimeout(), List.of("worktree", "prune"));
    }

    /** 查询候选目录是否仍登记在 Git worktree 元数据中；查询失败必须按“不确定”处理。 */
    public WorktreeRegistration worktreeRegistration(Path root, Path stage) {
        if (stage == null || !stage.isAbsolute()) {
            return new WorktreeRegistration(false, "worktree 路径必须是绝对路径");
        }
        AutoUpdateCommandRunner.Result result = git(root, properties.getCommandTimeout(),
                List.of("worktree", "list", "--porcelain", "-z"));
        if (!result.success()) return new WorktreeRegistration(false, result.summary());
        if (result.stdout().contains("…(output truncated)")) {
            return new WorktreeRegistration(false, "Git worktree 列表输出被截断");
        }
        Path expected = stage.toAbsolutePath().normalize();
        for (String token : result.stdout().split("\\u0000", -1)) {
            if (!token.startsWith("worktree ")) continue;
            String raw = token.substring("worktree ".length());
            try {
                if (samePath(expected, Path.of(raw).toAbsolutePath().normalize())) {
                    return new WorktreeRegistration(true, null);
                }
            } catch (RuntimeException e) {
                return new WorktreeRegistration(false, "无法解析 Git worktree 路径");
            }
        }
        return new WorktreeRegistration(false, null);
    }

    private OperationCheck activeOperation(Path root) {
        for (String marker : OPERATION_MARKERS) {
            AutoUpdateCommandRunner.Result result = git(root, properties.getCommandTimeout(),
                    List.of("rev-parse", "--git-path", marker));
            if (!result.success()) return new OperationCheck(null, result.summary());
            String value = result.stdout().trim();
            if (value.isBlank()) return new OperationCheck(null, "空 git-path：" + marker);
            Path path = Path.of(value);
            if (!path.isAbsolute()) path = root.resolve(path);
            if (Files.exists(path.normalize())) return new OperationCheck(marker, null);
        }
        return new OperationCheck(null, null);
    }

    private RefResult revParse(Path root, String ref) {
        AutoUpdateCommandRunner.Result result = git(root, properties.getCommandTimeout(),
                List.of("rev-parse", "--verify", ref));
        String value = result.stdout().trim();
        return result.success() && validSha(value)
                ? new RefResult(value.toLowerCase(Locale.ROOT), null)
                : new RefResult(null, result.summary());
    }

    private AncestorResult isAncestor(Path root, String ancestor, String descendant) {
        AutoUpdateCommandRunner.Result result = git(root, properties.getCommandTimeout(),
                List.of("merge-base", "--is-ancestor", ancestor, descendant));
        if (result.timedOut() || result.launchError() != null) return AncestorResult.ERROR;
        if (result.exitCode() == 0) return AncestorResult.YES;
        if (result.exitCode() == 1) return AncestorResult.NO;
        return AncestorResult.ERROR;
    }

    private AutoUpdateCommandRunner.Result git(Path root, Duration timeout, List<String> args) {
        List<String> command = new java.util.ArrayList<>();
        command.add(properties.getGitCommand());
        command.addAll(args);
        return runner.run(root, timeout, command, NON_INTERACTIVE_GIT);
    }

    private static RepositoryState blocked(Disposition disposition, String reason, String local, String remote) {
        return new RepositoryState(disposition, reason, local, remote);
    }

    private static boolean validSha(String value) { return value != null && SHA.matcher(value).matches(); }

    private static Path findRoot(Path start) {
        if (start == null) return null;
        Path current = canonical(start);
        while (current != null) {
            if (Files.exists(current.resolve(".git")) && Files.isRegularFile(current.resolve("pom.xml"))) return current;
            current = current.getParent();
        }
        return null;
    }

    private static Path canonical(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        try {
            return normalized.toRealPath();
        } catch (IOException e) {
            return normalized;
        }
    }

    private static boolean samePath(Path left, Path right) {
        try {
            return Files.isSameFile(left, right);
        } catch (IOException | RuntimeException e) {
            boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
            String a = left.toAbsolutePath().normalize().toString();
            String b = right.toAbsolutePath().normalize().toString();
            return windows ? a.equalsIgnoreCase(b) : a.equals(b);
        }
    }

    public enum Disposition {
        UP_TO_DATE,
        BEHIND,
        UNAVAILABLE,
        INVALID_CONFIGURATION,
        DETACHED,
        WRONG_BRANCH,
        WRONG_UPSTREAM,
        OPERATION_IN_PROGRESS,
        DIRTY,
        AHEAD,
        DIVERGED,
        ERROR
    }

    public record RepositoryState(Disposition disposition, String reason, String localHead, String remoteHead) {
        public boolean updateAvailable() { return disposition == Disposition.BEHIND; }
    }

    public record Validation(boolean valid, String message) { }
    public record WorktreeRegistration(boolean registered, String error) { }

    private record OperationCheck(String marker, String error) { }
    private record RefResult(String value, String error) { }
    private enum AncestorResult { YES, NO, ERROR }
}
