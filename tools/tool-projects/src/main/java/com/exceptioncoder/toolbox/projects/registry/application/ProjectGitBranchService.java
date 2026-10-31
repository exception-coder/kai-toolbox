package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.common.git.GitBranchSwitchPreview;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitWorkspaceOperations;
import com.exceptioncoder.toolbox.common.git.GitWorkspaceStatus;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitCommand;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitPullReader;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitWorkspaceReader;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

/** 状态获取与分支切换共用仓库写锁；不强制覆盖、不 stash，不自动重试。 */
@Service
public class ProjectGitBranchService implements GitWorkspaceOperations {
    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    private final ProjectGitWorkspaceReader reader;
    private final ProjectGitPullReader cleanReader;
    private final ProjectGitCommand command;
    private final ProjectGitMutationLock mutations;
    private final GitLogService git;

    public ProjectGitBranchService(ProjectGitWorkspaceReader reader, ProjectGitPullReader cleanReader,
                                   ProjectGitCommand command, ProjectGitMutationLock mutations, GitLogService git) {
        this.reader = reader;
        this.cleanReader = cleanReader;
        this.command = command;
        this.mutations = mutations;
        this.git = git;
    }

    @Override
    public GitWorkspaceStatus status(Path repository, boolean refreshRemote) {
        Path root = mutations.canonicalRoot(repository);
        return mutations.execute(root, () -> {
            var before = reader.inspect(root);
            boolean checked = false;
            String notice = "远端尚未核对，数量来自本地已获取记录";
            if (refreshRemote && !before.upstreamRef().isEmpty()) {
                try {
                    String url = run(root, "remote", "get-url", before.view().remote()).strip();
                    command.run(root, Duration.ofSeconds(60), "fetch", "--no-tags", "--no-recurse-submodules", "--",
                            url, "+" + before.target() + ":" + before.upstreamRef()).requireSuccess();
                    var after = reader.inspect(root);
                    checked = after.view().branch().equals(before.view().branch())
                            && after.upstreamRef().equals(before.upstreamRef())
                            && after.target().equals(before.target())
                            && run(root, "remote", "get-url", after.view().remote()).strip().equals(url);
                    notice = checked ? "已核对上游；仅更新远端记录，未更新工作文件" : "刷新期间分支或上游配置已变化，请重新刷新";
                } catch (IllegalStateException exception) {
                    notice = "远端获取失败：" + exception.getMessage() + "；当前数量仅供本地参考";
                }
            }
            var view = reader.inspect(root).view();
            if (view.upstream().isEmpty()) notice = view.pushBlockedReason();
            return new GitWorkspaceStatus(view.branch(), view.head(), view.upstream(), view.ahead(), view.behind(),
                    view.files().size(), checked, checked ? Instant.now().toString() : "", notice);
        });
    }

    @Override
    public GitBranchSwitchPreview prepareSwitch(Path repository, String ref) {
        Path root = mutations.canonicalRoot(repository);
        return mutations.execute(root, () -> switchSnapshot(root, ref));
    }

    @Override
    public String switchBranch(Path repository, String ref, String token) {
        Path root = mutations.canonicalRoot(repository);
        return mutations.execute(root, () -> {
            var snapshot = switchSnapshot(root, ref);
            if (token == null || !token.equals(snapshot.token())) {
                throw new IllegalArgumentException("分支或目标提交已变化，请重新检查后确认切换");
            }
            if (snapshot.tracking().isEmpty()) {
                run(root, "checkout", "--no-overwrite-ignore", snapshot.localBranch());
            } else {
                run(root, "checkout", "--no-overwrite-ignore", "--track", "-b", snapshot.localBranch(), snapshot.ref());
            }
            String actualBranch = run(root, "symbolic-ref", "--quiet", "--short", "HEAD").strip();
            String actualHead = run(root, "rev-parse", "--verify", "HEAD").strip();
            if (!actualBranch.equals(snapshot.localBranch()) || !actualHead.equals(snapshot.targetHead())) {
                throw new IllegalStateException("切换后仓库又发生变化，请核对实际分支和文件，不会自动重试");
            }
            return "已切换到 " + actualBranch;
        });
    }

    private GitBranchSwitchPreview switchSnapshot(Path root, String ref) {
        cleanReader.requireClean(root);
        var branchResult = command.run(root, TIMEOUT, "symbolic-ref", "--quiet", "--short", "HEAD");
        if (branchResult.exitCode() == 1) {
            throw new IllegalArgumentException("当前处于游离 HEAD，请先在本机 Git 中保存提交并切换分支");
        }
        String current = branchResult.requireSuccess().strip();
        String head = run(root, "rev-parse", "--verify", "HEAD").strip();
        var target = git.listBranches(root).stream().filter(branch -> branch.ref().equals(ref) && !branch.head().isBlank())
                .findFirst().orElseThrow(() -> new IllegalArgumentException("目标分支已不存在，请刷新列表"));
        if (target.current()) throw new IllegalArgumentException("已经处于该分支，无需切换");
        String local = target.name();
        String tracking = "";
        if (target.remote()) {
            String remote = run(root, "remote").lines().filter(name -> target.name().startsWith(name + "/"))
                    .max(java.util.Comparator.comparingInt(String::length))
                    .orElseThrow(() -> new IllegalArgumentException("远端配置不存在，请刷新后核对"));
            local = target.name().substring(remote.length() + 1);
            if (git.listBranches(root).stream().anyMatch(branch -> branch.ref().equals("refs/heads/" + target.name().substring(remote.length() + 1)))) {
                throw new IllegalArgumentException("同名本地分支已存在，请选择本地分支；不会覆盖或重设其跟踪关系");
            }
            tracking = target.name();
        }
        run(root, "check-ref-format", "--branch", local);
        String token = digest(String.join("\0", root.toString(), current, head, ref, target.head(), local, tracking));
        return new GitBranchSwitchPreview(current, head, ref, target.head(), local, tracking, token);
    }

    private String run(Path root, String... args) {
        return command.run(root, TIMEOUT, args).requireSuccess();
    }

    private String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }
}
