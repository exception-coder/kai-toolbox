package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.domain.ScanSourceType;
import com.exceptioncoder.toolbox.treesize.repository.NodeRepository;
import com.exceptioncoder.toolbox.treesize.repository.ScanRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Move a directory to a different location and replace the original path with a directory
 * junction pointing at the new location, so callers that reference the old path keep working.
 *
 * <p>Implementation choices:
 * <ul>
 *   <li><b>{@code robocopy /E /MOVE}</b> instead of {@code move}: the {@code move} builtin
 *       cannot move a directory across drives — it only does same-volume rename and reports
 *       a misleading "access denied" cross-volume. {@code robocopy} handles cross-volume
 *       directory trees, copes with partially-locked files better, and is built into Windows.</li>
 *   <li><b>{@code mklink /J}</b> (NTFS junction) instead of {@code mklink /D} (symlink):
 *       junctions do not require administrator privileges or Windows Developer Mode, are
 *       transparent to virtually every application that traverses them, and only constrain
 *       us to local NTFS volumes — which is exactly the C:↔D: relocation case here.</li>
 * </ul>
 *
 * <p>When a non-null {@code taskId} is supplied, the service streams progress via the shared
 * {@link SseEmitterRegistry} so the UI can show "phase / current file / bytes moved" instead
 * of a multi-minute black box. Robocopy's per-file output (file list lines, kept by removing
 * {@code /NFL}) is parsed line-by-line and forwarded as {@code progress} events.
 */
@Component
public class SymlinkService {

    private static final Logger log = LoggerFactory.getLogger(SymlinkService.class);

    private final ScanRepository scans;
    private final NodeRepository nodes;
    private final SseEmitterRegistry sse;

    public SymlinkService(ScanRepository scans, NodeRepository nodes, SseEmitterRegistry sse) {
        this.scans = scans;
        this.nodes = nodes;
        this.sse = sse;
    }

    /**
     * Validate inputs, move {@code source} → {@code target}, then create a directory symlink
     * at {@code source} pointing at {@code target}. Rolls back the move if symlink creation
     * fails. {@code taskId} may be {@code null} to skip SSE progress publishing.
     */
    public Result relocateAndLink(String scanId, String sourceRaw, String targetRaw, String taskId) throws IOException {
        ScanRecord scan = scans.findById(scanId)
                .orElseThrow(() -> new IllegalArgumentException("scan not found: " + scanId));
        if (scan.getSourceType() != ScanSourceType.LOCAL_WINDOWS) {
            throw new IllegalArgumentException("仅支持本地扫描的目录创建软链接");
        }

        Path source = Path.of(sourceRaw).toAbsolutePath().normalize();
        Path target = Path.of(targetRaw).toAbsolutePath().normalize();

        validate(scan, source, target);

        Progress progress = new Progress(taskId);
        progress.phase("preparing", "计算大小…");
        long movedBytes = sizeOfQuiet(source);
        progress.phase("preparing", "源大小约 " + humanBytes(movedBytes) + "，准备移动");

        try {
            log.info("symlink: moving {} -> {}", source, target);
            Files.createDirectories(target.getParent());
            progress.phase("moving", "正在跨盘移动数据（robocopy）…");
            runRobocopyWithProgress(source.toString(), target.toString(), progress);
            ensureSourceRemoved(source, target);

            try {
                log.info("symlink: linking {} -> {}", source, target);
                progress.phase("linking", "创建联接 mklink /J …");
                runCmd("mklink", "/J", source.toString(), target.toString());
            } catch (IOException e) {
                log.warn("symlink: mklink failed, rolling back move. source={} target={}", source, target, e);
                progress.phase("rollback", "创建联接失败，正在回滚移动…");
                try {
                    runRobocopyWithProgress(target.toString(), source.toString(), progress);
                    ensureSourceRemoved(target, source);
                } catch (IOException rollback) {
                    log.error("symlink: ROLLBACK FAILED. data is at {} but original path {} is gone",
                            target, source, rollback);
                    throw new IOException(
                            "创建联接失败且回滚失败：原数据已移动到 " + target + "，请手动恢复。错误：" + e.getMessage(), e);
                }
                throw new IOException("创建联接失败：" + e.getMessage() + "（已回滚移动）", e);
            }

            nodes.deleteSubtreeByPath(scanId, source.toString());
            progress.phase("done", "完成");
            progress.complete();
            return new Result(source.toString(), target.toString(), movedBytes);
        } catch (RuntimeException | IOException e) {
            progress.error(e.getMessage());
            throw e;
        }
    }

    private void validate(ScanRecord scan, Path source, Path target) throws IOException {
        Path scanRoot = Path.of(scan.getRootPath()).toAbsolutePath().normalize();
        if (!source.startsWith(scanRoot)) {
            throw new IllegalArgumentException("源路径不在扫描根目录内");
        }
        if (source.equals(scanRoot)) {
            throw new IllegalArgumentException("不能对扫描根目录创建软链接");
        }
        if (!Files.exists(source)) {
            throw new IllegalArgumentException("源路径不存在：" + source);
        }
        if (!Files.isDirectory(source)) {
            throw new IllegalArgumentException("源路径不是目录：" + source);
        }
        if (Files.isSymbolicLink(source)) {
            throw new IllegalArgumentException("源路径已是软链接：" + source);
        }
        if (target.equals(source)) {
            throw new IllegalArgumentException("目标路径不能与源路径相同");
        }
        if (target.startsWith(source)) {
            throw new IllegalArgumentException("目标路径不能位于源路径内部");
        }
        if (Files.exists(target)) {
            throw new IllegalArgumentException("目标路径已存在：" + target);
        }
        Path targetParent = target.getParent();
        if (targetParent == null) {
            throw new IllegalArgumentException("目标路径无效（缺少父目录）：" + target);
        }
    }

    /**
     * After a successful {@code robocopy /E /MOVE}, the leaf-level source directory may still
     * exist as an empty shell (robocopy quirk). Empty shell → safe to remove. Non-empty →
     * means files were locked and skipped from the move; the destination is therefore
     * incomplete and we must abort before {@code mklink} to avoid masking data loss.
     */
    private static void ensureSourceRemoved(Path source, Path target) throws IOException {
        if (!Files.exists(source)) return;
        try (var stream = Files.list(source)) {
            if (stream.findAny().isEmpty()) {
                Files.delete(source);
                return;
            }
        }
        throw new IOException("robocopy 完成但源目录 " + source + " 仍残留文件 — "
                + "意味着部分文件被进程占用未能搬走，目标 " + target + " 数据可能不完整。"
                + "请关闭占用源目录的程序后重试。");
    }

    private static long sizeOfQuiet(Path dir) {
        try (var stream = Files.walk(dir)) {
            return stream.filter(Files::isRegularFile).mapToLong(p -> {
                try {
                    return Files.size(p);
                } catch (IOException e) {
                    return 0L;
                }
            }).sum();
        } catch (IOException e) {
            return 0L;
        }
    }

    /**
     * Charset cmd.exe writes its stdout/stderr in. On Chinese Windows this is GBK (CP936),
     * not UTF-8 — but JDK 21 defaults {@code file.encoding} to UTF-8, so reading cmd output
     * with the platform default produces mojibake like {@code �ܾ����ʡ�}.
     * {@code native.encoding} (added in JDK 17) reflects the OS native encoding regardless
     * of {@code file.encoding} and is the right choice for talking to legacy console tools.
     */
    private static final Charset CMD_OUTPUT_CHARSET = resolveCmdCharset();

    private static Charset resolveCmdCharset() {
        String name = System.getProperty("native.encoding");
        if (name != null && !name.isBlank()) {
            try {
                return Charset.forName(name);
            } catch (Exception ignored) {
                // fall through
            }
        }
        return Charset.defaultCharset();
    }

    private static void runCmd(String... args) throws IOException {
        runProcess(new String[] { "cmd.exe", "/c" }, args, exit -> exit == 0, null);
    }

    /**
     * Robocopy returns granular exit codes — anything below 8 is a success variant.
     * Keeping {@code /NFL} OFF (no flag) means we get one line per file copied, which we
     * forward to the SSE channel so the UI can show "currently copying X".
     *
     * <p><b>Critical:</b> {@code /R:0 /W:1} disables robocopy's default retry policy
     * (1 000 000 retries × 30 s wait), which would otherwise make a single locked file
     * block the operation for literal months with no UI feedback. {@code /R:0} fails fast
     * on the first locked file and bubbles a clear error up to the user.
     */
    private static void runRobocopyWithProgress(String source, String target, Progress progress) throws IOException {
        runProcess(new String[] { "robocopy" },
                new String[] { source, target, "/E", "/MOVE", "/NDL", "/NJH", "/NJS", "/NP", "/BYTES",
                        "/R:0", "/W:1" },
                exit -> exit < 8,
                progress);
    }

    private interface ExitPredicate { boolean isSuccess(int exit); }

    /**
     * {@code progress} may be {@code null} for non-streaming commands (mklink, etc.). When
     * non-null, every non-empty line is forwarded as a robocopy-flavored progress event,
     * which lets the UI show real-time activity instead of a frozen spinner.
     */
    private static void runProcess(String[] launcher, String[] args, ExitPredicate ok, Progress progress) throws IOException {
        List<String> cmdline = new ArrayList<>();
        cmdline.addAll(Arrays.asList(launcher));
        cmdline.addAll(Arrays.asList(args));
        Process p = new ProcessBuilder(cmdline).redirectErrorStream(true).start();

        StringBuilder allOutput = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream(), CMD_OUTPUT_CHARSET))) {
            String line;
            while ((line = reader.readLine()) != null) {
                allOutput.append(line).append('\n');
                if (progress != null) {
                    String parsed = parseRobocopyLine(line);
                    if (parsed != null) {
                        progress.copying(parsed);
                    }
                }
            }
        }
        int exit;
        try {
            exit = p.waitFor();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("命令被中断", e);
        }
        if (!ok.isSuccess(exit)) {
            String full = allOutput.toString().trim();
            String trimmed = trimOutputForError(full);
            String lowered = trimmed.toLowerCase(Locale.ROOT);
            String hint = "";
            if (lowered.contains("access is denied") || trimmed.contains("拒绝访问")
                    || full.contains("正被另一进程使用") || full.contains("being used by another process")) {
                hint = "（提示：目录可能被进程占用，请先关闭使用该目录的程序后再试）";
            }
            throw new IOException("命令失败 exit=" + exit + ": " + String.join(" ", args) + hint
                    + (trimmed.isEmpty() ? "" : " | " + trimmed));
        }
    }

    /**
     * Robocopy can dump thousands of lines on partial failure (one line per locked file).
     * Keep the first error-shaped line and the last few lines so the user has enough to
     * diagnose without flooding the UI; full output is still in the server log.
     */
    private static String trimOutputForError(String full) {
        if (full == null || full.isEmpty()) return "";
        String[] lines = full.split("\\R");
        if (lines.length <= 6) return full;
        StringBuilder sb = new StringBuilder();
        // First line that mentions an error / 错误 / process — that's usually the headline cause.
        for (String l : lines) {
            String low = l.toLowerCase(Locale.ROOT);
            if (low.contains("error") || l.contains("错误") || low.contains("denied") || l.contains("拒绝")
                    || low.contains("being used") || l.contains("正被另一进程")) {
                sb.append(l.trim()).append('\n');
                break;
            }
        }
        sb.append("…（省略 ").append(lines.length - 4).append(" 行，详见服务器日志）…\n");
        for (int i = Math.max(0, lines.length - 3); i < lines.length; i++) {
            sb.append(lines[i].trim()).append('\n');
        }
        return sb.toString().trim();
    }

    /**
     * Forward robocopy file-list lines to the UI. With our flag set lines look like
     * {@code "  New File          12345  filename.txt"} (whitespace + status + size + name).
     * Drop banner / separator / blank / percentage-only lines so we don't spam SSE clients.
     */
    private static String parseRobocopyLine(String line) {
        if (line == null) return null;
        String trimmed = line.trim();
        if (trimmed.isEmpty()) return null;
        if (trimmed.startsWith("--") || trimmed.startsWith("==")) return null;
        // Pure-percentage progress lines (per-file %) — robocopy keeps overwriting these.
        // We disabled them with /NP but be defensive in case someone removes the flag.
        if (trimmed.endsWith("%") && trimmed.length() <= 5) return null;
        return trimmed;
    }

    private static String humanBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double value = bytes;
        String[] units = { "KB", "MB", "GB", "TB" };
        int idx = -1;
        do {
            value /= 1024;
            idx++;
        } while (value >= 1024 && idx < units.length - 1);
        return String.format("%.2f %s", value, units[idx]);
    }

    /**
     * Tiny progress helper: holds the SSE registry + taskId and emits typed events. {@code null}
     * taskId disables publishing (useful for callers that don't care about progress).
     */
    private final class Progress {
        private final String taskId;

        Progress(String taskId) {
            this.taskId = taskId;
        }

        void phase(String phase, String message) {
            if (taskId == null) return;
            sse.publish(taskId, "progress", Map.of("phase", phase, "message", message));
        }

        void copying(String line) {
            if (taskId == null) return;
            sse.publish(taskId, "progress", Map.of("phase", "moving", "current", line));
        }

        void complete() {
            if (taskId == null) return;
            sse.publish(taskId, "completed", Map.of("phase", "done"));
            sse.complete(taskId);
        }

        void error(String message) {
            if (taskId == null) return;
            sse.publish(taskId, "error", Map.of("message", message == null ? "" : message));
            sse.complete(taskId);
        }
    }

    public record Result(String sourcePath, String targetPath, long movedBytes) {}
}
