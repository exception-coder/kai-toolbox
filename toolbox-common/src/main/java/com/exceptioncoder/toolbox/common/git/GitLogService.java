package com.exceptioncoder.toolbox.common.git;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

/**
 * 共享只读 git 查询：列最近提交（git log）、取单提交 diff（git show）。供任意工具复用。
 *
 * <p>安全：ProcessBuilder 显式 argv（不走 shell）杜绝命令注入；用 {@code git -C <dir>} 指定工作目录（路径不进
 * 可被解释的参数位）；hash 仍正则兜底。资源：子进程超时 + 输出字节上限（超则截断）。</p>
 */
@Slf4j
@Service
public class GitLogService {

    /** 字段分隔符：US 控制符(0x1f)，对应 git --pretty 的 %x1f；正文几乎不会出现，安全分隔。用码点构造避免源码里出现不可见字符。 */
    private static final String FS = new String(new char[]{0x1f});
    /** 头/正文分隔符：RS 控制符(0x1e)，对应 git %x1e。 */
    private static final String RS = new String(new char[]{0x1e});
    private static final Pattern HASH_RE = Pattern.compile("^[0-9a-fA-F]{7,40}$");
    private static final String PRETTY = "%H%x1f%h%x1f%an%x1f%aI%x1f%s";
    private static final String LOG_PRETTY = PRETTY + "%x1f%b%x1e";

    private final GitProperties props;
    private final GitStatusReader statusReader;

    public GitLogService(GitProperties props) {
        this.props = props;
        this.statusReader = new GitStatusReader(props, (arguments, input) -> {
            Result result = exec(arguments, input, input != null);
            if (result.truncated()) {
                throw new IllegalStateException("Git 文件清单超过采集上限，请缩小仓库范围后重试");
            }
            return result.stdout();
        });
    }

    /** 列最近提交。limit 钳到 [1, commitLimitMax]。 */
    public List<CommitInfo> listCommits(Path dir, int limit) {
        return readCommits(dir, limit, null);
    }

    /** 只浏览仓库已有本地/远端引用，不 fetch、不 checkout；排除 origin/HEAD 等符号别名。 */
    public List<GitBranchRef> listBranches(Path dir) {
        Result result = exec(List.of(props.getBinary(), "-C", dir.toString(), "for-each-ref",
                "--sort=-committerdate", "--format=%(refname)%09%(objectname)%09%(HEAD)%09%(symref)",
                "refs/heads/", "refs/remotes/"));
        if (result.truncated()) {
            throw new IllegalStateException("分支列表超过读取上限，请缩小仓库范围");
        }
        List<GitBranchRef> branches = new ArrayList<>();
        for (String line : result.stdout().lines().toList()) {
            String[] fields = line.split("\t", -1);
            if (fields.length != 4 || !fields[3].isBlank()) continue;
            boolean remote = fields[0].startsWith("refs/remotes/");
            String prefix = remote ? "refs/remotes/" : "refs/heads/";
            branches.add(new GitBranchRef(fields[0], fields[0].substring(prefix.length()), fields[1],
                    "*".equals(fields[2]), remote));
        }
        if (branches.stream().noneMatch(GitBranchRef::current)) {
            // 新仓库的 unborn 分支和 detached HEAD 均保留明确的当前入口。
            String symbolic = exec(List.of(props.getBinary(), "-C", dir.toString(), "symbolic-ref", "-q", "HEAD"),
                    null, true).stdout().strip();
            if (symbolic.startsWith("refs/heads/")) {
                branches.addFirst(new GitBranchRef(symbolic, symbolic.substring("refs/heads/".length()), "", true, false));
            } else {
                String head = workspaceHead(dir);
                branches.addFirst(new GitBranchRef("HEAD", "HEAD（游离）", head == null ? "" : head, true, false));
            }
        }
        branches.sort((left, right) -> Boolean.compare(right.current(), left.current()));
        return branches;
    }

    /** 仅接受仓库实际列出的分支，固定其提交版本后查询，防止选项/修订表达式注入。 */
    public List<CommitInfo> listCommits(Path dir, int limit, String branch) {
        if (branch == null || branch.isBlank()) return listCommits(dir, limit);
        GitBranchRef selected = listBranches(dir).stream().filter(candidate -> candidate.ref().equals(branch))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("分支已不存在，请刷新分支列表"));
        if (selected.head().isEmpty()) return List.of();
        return readCommits(dir, limit, selected.head());
    }

    private List<CommitInfo> readCommits(Path dir, int limit, String head) {
        int n = Math.max(1, Math.min(limit, props.getCommitLimitMax()));
        List<String> arguments = new ArrayList<>(List.of(
                props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "log", "-n", String.valueOf(n), "--no-color", "--pretty=format:" + LOG_PRETTY));
        if (head != null) arguments.add(head);
        arguments.add("--");
        Result r = exec(arguments);
        List<CommitInfo> out = new ArrayList<>();
        for (String record : r.stdout().split(RS)) {
            String normalized = record.stripLeading();
            if (normalized.isBlank()) continue;
            String[] f = normalized.split(FS, -1);
            if (f.length < 6) continue;
            out.add(new CommitInfo(f[0], f[1], f[2], f[3], f[4], f[5].strip()));
        }
        return out;
    }

    /** 读取时间段内所有现存引用的非合并提交；完整性不足时拒绝交付截断证据。 */
    public String readReportEvidence(Path dir, java.time.Instant from, java.time.Instant until, String author) {
        if (from == null || until == null || !from.isBefore(until) || author == null || author.isBlank()) {
            throw new IllegalArgumentException("周报必须指定有效日期范围和作者姓名或邮箱");
        }
        Result result = exec(List.of(props.getBinary(), "-C", dir.toString(), "log", "--all", "--no-merges",
                "--since-as-filter=" + from, "--until=" + until.minusNanos(1), "--max-count=501", "--no-color",
                "--pretty=format:%H%x1f%an%x1f%ae%x1f%cI%x1f%s%x1f%b%x1e"));
        if (result.truncated()) {
            throw new IllegalArgumentException("Git 证据超过输出上限，请缩小周报范围");
        }
        String[] records = result.stdout().split(RS);
        if (records.length > 500) {
            throw new IllegalArgumentException("时间范围内超过 500 条提交，请缩小范围");
        }
        StringBuilder evidence = new StringBuilder();
        for (String record : records) {
            String[] fields = record.stripLeading().split(FS, -1);
            if (fields.length < 6 || !(fields[1].equalsIgnoreCase(author.strip())
                    || fields[2].equalsIgnoreCase(author.strip()))) {
                continue;
            }
            java.time.Instant committed = java.time.OffsetDateTime.parse(fields[3]).toInstant();
            if (!committed.isBefore(from) && committed.isBefore(until)) {
                evidence.append(record.strip()).append('\n');
            }
        }
        return evidence.toString();
    }

    /** 解析真实仓库根，用于同仓工作目录去重，不执行 fetch 或工作树写入。 */
    public Path repositoryRoot(Path directory) {
        Result result = exec(List.of(props.getBinary(), "-C", directory.toString(), "rev-parse", "--show-toplevel"));
        if (result.truncated()) {
            throw new IllegalArgumentException("Git 根目录输出不完整");
        }
        return Path.of(result.stdout().strip()).toAbsolutePath().normalize();
    }

    /**
     * 返回单个文件相对于 HEAD（或暂存区）的 unified diff。
     * 按状态选择最合适的 git diff 命令：
     * <ul>
     *   <li>x=A（新增已暂存）→ {@code git diff --cached HEAD -- path}（HEAD 无此文件→整文件作为 +）</li>
     *   <li>其余 → {@code git diff HEAD -- path}（包含暂存 + 工作树相对 HEAD 的全部变化）</li>
     *   <li>两者均为空（未跟踪等）→ 返回空 diff</li>
     * </ul>
     */
    public GitFileDiffResponse gitFileDiff(Path dir, String relativePath, String x) {
        // 新增文件（只在暂存区，HEAD 里没有）
        boolean isAdded = "A".equals(x);
        List<String> primaryCmd = isAdded
                ? List.of(props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "diff", "--cached", "--", relativePath)
                : List.of(props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "diff", "HEAD", "--", relativePath);
        try {
            Result r = exec(primaryCmd);
            if (!r.stdout().isBlank()) return new GitFileDiffResponse(r.stdout(), r.truncated());
        } catch (Exception ignore) { /* 文件不存在 HEAD 版本等，继续尝试 */ }
        // 备选：暂存区 vs HEAD
        if (!isAdded) {
            try {
                Result r = exec(List.of(props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                        "diff", "--cached", "--", relativePath));
                if (!r.stdout().isBlank()) return new GitFileDiffResponse(r.stdout(), r.truncated());
            } catch (Exception ignore) { /* ignore */ }
        }
        return new GitFileDiffResponse("", false);
    }

    /**
     * 返回暂存区、工作树状态和精确路径，未跟踪目录按 Git 的 normal 模式合并展示。
     * ignoredPaths 由原生 check-ignore 判定，包含已跟踪但匹配忽略规则的路径。
     */
    public GitStatusResponse gitStatus(Path dir) {
        return statusReader.read(dir);
    }

    /** 取单提交完整 diff（含 stat + patch）。 */
    public CommitDiff commitDiff(Path dir, String hash) {
        if (hash == null || !HASH_RE.matcher(hash).matches()) {
            throw new IllegalArgumentException("hash 非法");
        }
        Result r = exec(List.of(
                props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "show", hash, "--no-color", "--stat", "--patch", "--format=" + PRETTY + "%x1e"));
        String raw = r.stdout();
        int sep = raw.indexOf(RS);
        String[] f = (sep >= 0 ? raw.substring(0, sep) : "").split(FS, -1);
        String diff = sep >= 0 ? raw.substring(sep + 1).stripLeading() : raw;
        if (f.length >= 5) {
            return new CommitDiff(f[0], f[1], f[2], f[3], f[4], diff, r.truncated());
        }
        // 头解析失败兜底：仍把原始输出当 diff 返回
        return new CommitDiff(hash, hash.length() > 7 ? hash.substring(0, 7) : hash, "", "", "", raw, r.truncated());
    }

    /**
     * 返回两个提交之间的文件清单和统一 diff。
     *
     * @param dir  仓库目录
     * @param base 基线提交
     * @param head 当前提交
     * @return 提交区间变化
     */
    public GitRangeDiffResponse rangeDiff(Path dir, String base, String head) {
        requireHash(base);
        requireHash(head);
        Result names = exec(List.of(
                props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "diff", "--name-status", base + ".." + head));
        Result diff = exec(List.of(
                props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "diff", "--no-color", base + ".." + head));
        List<String> changedFiles = names.stdout().lines()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .toList();
        return new GitRangeDiffResponse(changedFiles, diff.stdout(), names.truncated() || diff.truncated());
    }

    private static void requireHash(String hash) {
        if (hash == null || !HASH_RE.matcher(hash).matches()) {
            throw new IllegalArgumentException("hash 非法");
        }
    }

    /** 当前 HEAD；新建仓库尚无提交时返回 null。 */
    public String workspaceHead(Path dir) {
        try {
            Result result = exec(List.of(props.getBinary(), "-C", dir.toString(), "rev-parse", "--verify", "--quiet", "HEAD"));
            return result.stdout().strip();
        } catch (IllegalStateException exception) {
            if ("git 执行失败：".equals(exception.getMessage())) return null;
            throw exception;
        }
    }

    /** 逐文件、NUL 分隔的状态，不把中文或空格路径按行拆分。 */
    public List<GitStatusEntry> workspaceEntries(Path dir) {
        Result result = exec(List.of(props.getBinary(), "-C", dir.toString(), "status", "--porcelain=v1", "-z", "-uall"));
        if (result.truncated()) throw new IllegalStateException("文件清单超过采集上限");
        List<GitStatusEntry> entries = new ArrayList<>();
        String[] parts = result.stdout().split("\u0000");
        for (int i = 0; i < parts.length; i++) {
            String value = parts[i];
            if (value.length() < 4) continue;
            String x = value.substring(0, 1), y = value.substring(1, 2);
            String original = ("R".equals(x) || "C".equals(x) || "R".equals(y)) && i + 1 < parts.length ? parts[++i] : null;
            entries.add(new GitStatusEntry(x, y, value.substring(3), original));
        }
        return entries;
    }

    /** 两个确定提交之间的路径差异，包含重命名前的路径。 */
    public List<GitStatusEntry> workspaceCommittedEntries(Path dir, String before, String after) {
        requireHash(before); requireHash(after);
        Result result = exec(List.of(props.getBinary(), "-C", dir.toString(), "diff", "--name-status", "-z", "-M", before, after, "--"));
        if (result.truncated()) throw new IllegalStateException("提交文件清单超过采集上限");
        List<GitStatusEntry> entries = new ArrayList<>();
        String[] parts = result.stdout().split("\u0000");
        for (int i = 0; i + 1 < parts.length; ) {
            String status = parts[i++], path = parts[i++], original = null;
            if ((status.startsWith("R") || status.startsWith("C")) && i < parts.length) { original = path; path = parts[i++]; }
            entries.add(new GitStatusEntry(status.substring(0, 1), " ", path, original));
        }
        return entries;
    }

    private record Result(String stdout, boolean truncated) {
    }

    /** 跑 git，捕获 stdout（截断到 diffMaxBytes）+ stderr；超时杀进程；非 0 退出抛异常带 stderr。 */
    private Result exec(List<String> argv) {
        return exec(argv, null, false);
    }

    private Result exec(List<String> argv, byte[] input, boolean allowNoMatch) {
        Process p;
        try {
            p = new ProcessBuilder(argv).redirectErrorStream(false).start();
        } catch (IOException e) {
            throw new IllegalStateException("启动 git 失败（确认 git 在 PATH 或配置 toolbox.git.binary）：" + e.getMessage(), e);
        }
        StringBuilder errBuf = new StringBuilder();
        Thread errReader = Thread.startVirtualThread(() -> drain(p.getErrorStream(), errBuf, 64 * 1024));
        ByteArrayOutputStream outBuf = new ByteArrayOutputStream();
        boolean[] truncated = {false};
        Thread outReader = Thread.startVirtualThread(() -> truncated[0] = drainBytes(p.getInputStream(), outBuf, props.getDiffMaxBytes()));
        AtomicReference<IOException> inputFailure = new AtomicReference<>();
        Thread inputWriter = writeInput(p, input, inputFailure);
        try {
            if (!p.waitFor(props.getTimeoutMs(), TimeUnit.MILLISECONDS)) {
                p.destroyForcibly();
                throw new IllegalStateException("git 执行超时");
            }
            outReader.join(1000);
            errReader.join(1000);
            inputWriter.join(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
            throw new IllegalStateException("git 执行被中断");
        }
        if (p.exitValue() != 0 && !(allowNoMatch && p.exitValue() == 1)) {
            throw new IllegalStateException("git 执行失败：" + errBuf.toString().strip());
        }
        if (inputFailure.get() != null) {
            throw new IllegalStateException("写入 Git 查询路径失败", inputFailure.get());
        }
        return new Result(outBuf.toString(StandardCharsets.UTF_8), truncated[0]);
    }

    private Thread writeInput(Process process, byte[] input, AtomicReference<IOException> failure) {
        return Thread.startVirtualThread(() -> {
            try (var stream = process.getOutputStream()) {
                if (input != null) {
                    stream.write(input);
                }
            } catch (IOException exception) {
                failure.set(exception);
            }
        });
    }

    /** 读到字节上限即停（标记截断），剩余流读掉避免子进程阻塞。返回是否截断。 */
    private boolean drainBytes(InputStream in, ByteArrayOutputStream out, int max) {
        byte[] buf = new byte[8192];
        boolean truncated = false;
        try {
            int n;
            while ((n = in.read(buf)) >= 0) {
                int room = max - out.size();
                if (room <= 0) {
                    truncated = true;
                    continue; // 继续读掉，但不再缓存
                }
                out.write(buf, 0, Math.min(n, room));
                if (n > room) truncated = true;
            }
        } catch (IOException e) {
            log.debug("读取 git stdout 失败", e);
        }
        return truncated;
    }

    private void drain(InputStream in, StringBuilder sb, int max) {
        byte[] buf = new byte[4096];
        try {
            int n;
            while ((n = in.read(buf)) >= 0 && sb.length() < max) {
                sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            log.debug("读取 git stderr 失败", e);
        }
    }
}
