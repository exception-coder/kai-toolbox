package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.common.git.GitPullPreview;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;

/** 读取快进需要的本地状态与上游配置，固定 fetch 源和版本。 */
@Component
public class ProjectGitPullReader {
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(15);
    private final ProjectGitCommand command;

    public ProjectGitPullReader(ProjectGitCommand command) {
        this.command = command;
    }

    /** @return 可拉取的目标配置；脏工作树和未完成操作在联网前拒绝 */
    public Target target(Path root) {
        requireClean(root);
        var branchResult = command.run(root, READ_TIMEOUT, "symbolic-ref", "--quiet", "--short", "HEAD");
        if (branchResult.exitCode() != 0) {
            throw new IllegalArgumentException("当前为 detached HEAD，请先切换到分支再拉取");
        }
        String branch = branchResult.output().strip();
        String head = run(root, "rev-parse", "--verify", "HEAD").strip();
        String[] fields = run(root, "for-each-ref", "--format=%(upstream)%00%(upstream:remotename)%00"
                + "%(upstream:remoteref)", "refs/heads/" + branch).strip().split("\0", -1);
        if (fields.length != 3 || !fields[0].startsWith("refs/remotes/") || fields[1].isEmpty()
                || fields[1].equals(".") || !fields[2].startsWith("refs/heads/")) {
            throw new IllegalArgumentException("未配置远端上游，请先在本机 Git 中设置 upstream 后重试");
        }
        String url = run(root, "remote", "get-url", fields[1]).strip();
        return new Target(branch, head, fields[0], fields[1], fields[2], url);
    }

    /** 拒绝工作树、暂存区、未跟踪文件和未完成 Git 整合。 */
    public void requireClean(Path root) {
        for (String marker : List.of("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge",
                "rebase-apply", "sequencer")) {
            Path path = Path.of(run(root, "rev-parse", "--git-path", marker).strip());
            if (Files.exists(path.isAbsolute() ? path : root.resolve(path))) {
                throw new IllegalArgumentException("存在未完成的合并、rebase 或拣选，请先在本机 Git 中处理");
            }
        }
        if (!run(root, "status", "--porcelain=v1", "-z", "--untracked-files=normal").isEmpty()) {
            throw new IllegalArgumentException("存在未提交或未跟踪文件，请先提交或自行处理后再拉取；不会自动暂存或覆盖");
        }
    }

    /** @return 本地已获取引用的比较与指纹；不执行网络请求 */
    public GitPullPreview snapshot(Path root, Target target) {
        String upstream = run(root, "rev-parse", "--verify", target.trackingRef()).strip();
        String[] counts = run(root, "rev-list", "--left-right", "--count", target.head() + "..." + upstream)
                .strip().split("\\s+");
        int ahead = Integer.parseInt(counts[0]);
        int behind = Integer.parseInt(counts[1]);
        String blocked = behind == 0 ? "已是最新，无需拉取" : ahead > 0
                ? "本地与上游已分叉，请在本机 Git 中处理后重新检查；不会自动合并或 rebase" : "";
        String token = digest(String.join("\0", root.toString(), target.branch(), target.head(),
                target.trackingRef(), target.remote(), target.remoteRef(), target.url(), upstream));
        return new GitPullPreview(target.branch(), target.head(), target.remote(),
                target.remoteRef().substring("refs/heads/".length()),
                ProjectGitWorkspaceReader.displayDestination(target.url()), upstream, ahead, behind, blocked, token);
    }

    private String run(Path root, String... arguments) {
        return command.run(root, READ_TIMEOUT, arguments).requireSuccess();
    }

    private String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    /** 内部读取目标，URL 可能含凭据，不得直接序列化。 */
    public record Target(/** 当前分支。 */ String branch, /** 当前提交。 */ String head,
                         /** 本地上游引用。 */ String trackingRef, /** 远端名。 */ String remote,
                         /** 完整远端分支。 */ String remoteRef, /** 实际读取地址。 */ String url) { }
}
