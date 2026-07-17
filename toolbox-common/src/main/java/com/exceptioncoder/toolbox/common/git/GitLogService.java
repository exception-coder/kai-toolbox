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

    private final GitProperties props;

    public GitLogService(GitProperties props) {
        this.props = props;
    }

    /** 列最近提交。limit 钳到 [1, commitLimitMax]。 */
    public List<CommitInfo> listCommits(Path dir, int limit) {
        int n = Math.max(1, Math.min(limit, props.getCommitLimitMax()));
        Result r = exec(List.of(
                props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "log", "-n", String.valueOf(n), "--no-color", "--pretty=format:" + PRETTY));
        List<CommitInfo> out = new ArrayList<>();
        for (String line : r.stdout().split("\n")) {
            if (line.isBlank()) continue;
            String[] f = line.split(FS, -1);
            if (f.length < 5) continue;
            out.add(new CommitInfo(f[0], f[1], f[2], f[3], f[4]));
        }
        return out;
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
     * 返回工作区待提交文件列表（{@code git status --porcelain -u}）。
     * 每条 entry 含 x（index/暂存区状态）、y（工作树状态）、path（相对路径）、origPath（重命名时的原路径）。
     */
    public GitStatusResponse gitStatus(Path dir) {
        Result r = exec(List.of(
                props.getBinary(), "-c", "core.quotepath=false", "-C", dir.toString(),
                "status", "--porcelain", "-u"));
        List<GitStatusEntry> entries = new ArrayList<>();
        for (String line : r.stdout().split("\n")) {
            if (line.length() < 3) continue;
            String x = String.valueOf(line.charAt(0));
            String y = String.valueOf(line.charAt(1));
            // char[2] 是空格分隔符
            String rest = line.length() > 3 ? line.substring(3) : "";
            // 重命名/复制：old -> new
            String path, origPath = null;
            int arrow = rest.indexOf(" -> ");
            if (arrow >= 0) {
                origPath = rest.substring(0, arrow).trim();
                path = rest.substring(arrow + 4).trim();
            } else {
                path = rest.trim();
            }
            entries.add(new GitStatusEntry(x, y, path, origPath));
        }
        return new GitStatusResponse(entries);
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

    private record Result(String stdout, boolean truncated) {
    }

    /** 跑 git，捕获 stdout（截断到 diffMaxBytes）+ stderr；超时杀进程；非 0 退出抛异常带 stderr。 */
    private Result exec(List<String> argv) {
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
        try {
            if (!p.waitFor(props.getTimeoutMs(), TimeUnit.MILLISECONDS)) {
                p.destroyForcibly();
                throw new IllegalStateException("git 执行超时");
            }
            outReader.join(1000);
            errReader.join(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
            throw new IllegalStateException("git 执行被中断");
        }
        if (p.exitValue() != 0) {
            throw new IllegalStateException("git 执行失败：" + errBuf.toString().strip());
        }
        return new Result(outBuf.toString(StandardCharsets.UTF_8), truncated[0]);
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
