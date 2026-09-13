package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.common.git.GitStatusEntry;
import com.exceptioncoder.toolbox.projects.registry.domain.ProjectGitWorkspace;
import com.exceptioncoder.toolbox.projects.registry.domain.ProjectGitWorkspace.OutgoingCommit;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/** 读取 Git 工作树及上游配置，生成推送所需的固定提交与目标快照。 */
@Component
public class ProjectGitWorkspaceReader {
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(15);
    private final ProjectGitCommand command;

    public ProjectGitWorkspaceReader(ProjectGitCommand command) {
        this.command = command;
    }

    /** 读取本地状态，不执行 fetch，也不修改工作树。 */
    private Snapshot read(Path root) {
        List<GitStatusEntry> files = files(run(root, "status", "--porcelain=v1", "-z", "-unormal"));
        String branch = run(root, "rev-parse", "--abbrev-ref", "--verify", "HEAD").strip();
        return readCommitted(root, branch.equals("HEAD") ? "" : branch, files);
    }

    /** 支持尚无提交的仓库，与一般 Git 执行失败严格区分。 */
    public Snapshot inspect(Path root) {
        String status = run(root, "status", "--porcelain=v2", "--branch", "-z", "-unormal");
        if (status.startsWith("# branch.oid (initial)\0")) {
            String branch = run(root, "symbolic-ref", "--short", "HEAD").strip();
            return unavailable(branch, "", files(run(root, "status", "--porcelain=v1", "-z", "-unormal")),
                    "尚无提交，请先在本机 Git 中创建首次提交");
        }
        return read(root);
    }

    private Snapshot readCommitted(Path root, String branch, List<GitStatusEntry> files) {
        String head = run(root, "rev-parse", "--verify", "HEAD").strip();
        if (branch.isEmpty()) {
            return unavailable(branch, head, files,
                    "当前为 detached HEAD，请先在本机 Git 中切换到分支");
        }
        String[] fields = run(root, "for-each-ref", "--format=%(upstream)%00%(upstream:short)%00"
                + "%(upstream:remotename)%00%(upstream:remoteref)", "refs/heads/" + branch).strip().split("\0", -1);
        if (fields.length != 4 || !fields[0].startsWith("refs/remotes/")
                || fields[2].isEmpty() || fields[2].equals(".")) {
            return unavailable(branch, head, files,
                    "未配置远端上游，请先在本机 Git 中设置该分支的 upstream");
        }
        var upstreamResult = command.run(root, READ_TIMEOUT, "rev-parse", "--verify", fields[0]);
        if (upstreamResult.exitCode() != 0) {
            return unavailable(branch, head, files, "本地缺少上游引用，请先在本机 Git 中 fetch 后刷新");
        }
        String upstreamHead = upstreamResult.output().strip();
        String[] counts = run(root, "rev-list", "--left-right", "--count", head + "..." + upstreamHead)
                .strip().split("\\s+");
        int ahead = Integer.parseInt(counts[0]);
        int behind = Integer.parseInt(counts[1]);
        List<String> urls = run(root, "remote", "get-url", "--push", "--all", fields[2])
                .lines().filter(url -> !url.isBlank()).distinct().toList();
        String fetchUrl = run(root, "remote", "get-url", fields[2]).strip();
        String blocked = !urls.isEmpty() && !urls.contains(fetchUrl)
                ? "推送地址未包含上游读取地址，请在本机 Git 中核对目标后推送"
                : pushBlock(urls, fields[3], ahead, behind);
        List<OutgoingCommit> commits = outgoing(root, upstreamHead, head);
        Position position = new Position(branch, head, fields[0], fields[2], fields[3], urls, upstreamHead);
        return snapshot(position, new Comparison(ahead, behind, blocked), files, commits);
    }

    private String pushBlock(List<String> urls, String target, int ahead, int behind) {
        if (urls.isEmpty() || !target.startsWith("refs/heads/")) {
            return "推送地址缺失或目标不是远端分支，请检查本机 Git remote 配置";
        }
        if (behind > 0) {
            return "当前分支落后上游，请先在本机 Git 中同步后刷新";
        }
        return ahead == 0 && urls.size() == 1 ? "没有待推送提交" : "";
    }

    private List<OutgoingCommit> outgoing(Path root, String upstreamHead, String head) {
        String log = run(root, "log", "-100", "--format=%H%x00%an%x00%aI%x00%s", "-z",
                upstreamHead + ".." + head, "--");
        String[] fields = log.split("\0", -1);
        List<OutgoingCommit> commits = new ArrayList<>();
        for (int i = 0; i + 3 < fields.length; i += 4) {
            commits.add(new OutgoingCommit(fields[i], fields[i + 1], fields[i + 2], fields[i + 3]));
        }
        return commits;
    }

    private List<GitStatusEntry> files(String output) {
        String[] records = output.split("\0", -1);
        List<GitStatusEntry> files = new ArrayList<>();
        for (int i = 0; i < records.length; i++) {
            String record = records[i];
            if (record.isEmpty()) {
                continue;
            }
            String x = record.substring(0, 1);
            String y = record.substring(1, 2);
            String path = record.substring(3);
            String original = null;
            if (x.equals("R") || x.equals("C") || y.equals("R") || y.equals("C")) {
                original = records[++i];
            }
            files.add(new GitStatusEntry(x, y, path, original));
        }
        return files;
    }

    private Snapshot unavailable(String branch, String head, List<GitStatusEntry> files, String reason) {
        return snapshot(new Position(branch, head, "", "", "", List.of(), ""),
                new Comparison(null, null, reason), files, List.of());
    }

    private Snapshot snapshot(Position position, Comparison comparison,
                              List<GitStatusEntry> files, List<OutgoingCommit> commits) {
        String token = digest(String.join("\0", position.branch(), position.head(), position.upstreamRef(),
                position.remote(), position.target(), String.join("\0", position.urls()), position.upstreamHead()));
        var view = new ProjectGitWorkspace(position.branch(), position.head(),
                position.upstreamRef().replaceFirst("^refs/remotes/", ""), position.remote(),
                position.target().replaceFirst("^refs/heads/", ""), position.urls().stream()
                .map(this::displayDestination).toList(), comparison.ahead(), comparison.behind(),
                files, commits, comparison.blocked(), token);
        return new Snapshot(view, position.urls(), position.target(), position.upstreamRef(), position.upstreamHead());
    }

    private String displayDestination(String url) {
        try {
            URI uri = URI.create(url);
            if (uri.getHost() != null) {
                return uri.getHost() + (uri.getPort() < 0 ? "" : ":" + uri.getPort()) + uri.getPath();
            }
        } catch (IllegalArgumentException exception) {
            return "本机 Git 配置的推送地址";
        }
        if (url.matches("^[^@\\s]+@[^:]+:.+$")) {
            return url.substring(url.indexOf('@') + 1).split("[?#]", 2)[0];
        }
        return "本地推送地址";
    }

    private String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    private String run(Path root, String... args) {
        return command.run(root, READ_TIMEOUT, args).requireSuccess();
    }

    /** 本地提交与解析后的远端位置。 */
    private record Position(/** 分支。 */ String branch, /** 当前提交。 */ String head,
                            /** 本地上游。 */ String upstreamRef, /** 远端名。 */ String remote,
                            /** 远端分支。 */ String target, /** 推送地址。 */ List<String> urls,
                            /** 上游提交。 */ String upstreamHead) { }

    /** 上游比较与动作条件。 */
    private record Comparison(/** 领先数量。 */ Integer ahead, /** 落后数量。 */ Integer behind,
                              /** 阻断原因。 */ String blocked) { }

    /** 内部推送目标不序列化到 API，防止 URL 中的凭据泄露。 */
    public record Snapshot(/** 可公开快照。 */ ProjectGitWorkspace view,
                           /** 已配置 push URL 列表。 */ List<String> urls, /** 完整目标引用。 */ String target,
                           /** 本地上游完整引用。 */ String upstreamRef,
                           /** 比较时的上游提交。 */ String upstreamHead) { }
}
