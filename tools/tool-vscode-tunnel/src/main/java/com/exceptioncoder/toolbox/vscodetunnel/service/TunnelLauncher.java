package com.exceptioncoder.toolbox.vscodetunnel.service;

import com.exceptioncoder.toolbox.vscodetunnel.config.VsCodeTunnelProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * 用 ProcessBuilder 启动 `code tunnel` 子进程。
 * 不持有进程引用：返回后由 TunnelManager 全权负责生命周期。
 */
@Component
public class TunnelLauncher {

    private static final Logger log = LoggerFactory.getLogger(TunnelLauncher.class);
    private static final boolean WINDOWS =
            System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    // Windows 下 VS Code CLI 实际是 code.cmd 批处理；Java 的 CreateProcess 只会按 .exe 找 PATH，
    // 必须显式按这个顺序解析裸命令名，否则会抛 IOException: CreateProcess error=2。
    private static final String[] WIN_EXTS = {".cmd", ".bat", ".exe", ""};

    private final VsCodeTunnelProperties props;

    public TunnelLauncher(VsCodeTunnelProperties props) {
        this.props = props;
    }

    public Process spawn(String tunnelName) {
        String resolved = resolveExecutable(props.codePath());

        List<String> cmd = new ArrayList<>();
        cmd.add(resolved);
        cmd.add("tunnel");
        if (props.acceptLicense()) {
            cmd.add("--accept-server-license-terms");
        }
        cmd.add("--name");
        cmd.add(tunnelName);

        log.info("Spawning code tunnel: {}", String.join(" ", cmd));

        ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true);
        try {
            return pb.start();
        } catch (IOException e) {
            throw new TunnelStartException(
                    "未找到 code 命令（path=" + props.codePath() + " resolved=" + resolved
                            + "），请确认 VS Code 已安装且 CLI 已加入 PATH",
                    e);
        }
    }

    /**
     * 同步执行 `code tunnel <extraArgs>` 子命令并返回 (exitCode, output)。
     * 用于残留扫描（R14 / RK5 落地）：status / kill 都是本地操作，不抛 TunnelStartException，
     * 启动失败也直接写进 CommandResult.output，由 UI 原样展示给用户判断。
     *
     * 输出按 8KB 截断，超时强杀返回 exitCode=-1。
     */
    public CommandResult runSubcommand(Duration timeout, String... extraArgs) {
        String resolved = resolveExecutable(props.codePath());
        List<String> cmd = new ArrayList<>();
        cmd.add(resolved);
        cmd.add("tunnel");
        for (String a : extraArgs) {
            cmd.add(a);
        }
        log.info("Running code tunnel subcommand: {}", String.join(" ", cmd));

        ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true);
        Process p;
        try {
            p = pb.start();
        } catch (IOException e) {
            return new CommandResult(-1,
                    "无法启动 code 命令（path=" + props.codePath() + " resolved=" + resolved + "）: "
                            + e.getMessage());
        }

        StringBuilder out = new StringBuilder();
        boolean truncated = false;
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (out.length() + line.length() + 1 > OUTPUT_CAP_BYTES) {
                    truncated = true;
                    break;
                }
                out.append(line).append('\n');
            }
        } catch (IOException ignore) {
            // 进程提前结束导致流关闭是正常情况，已读到的内容继续向后处理
        }

        boolean exited;
        try {
            exited = p.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
            return new CommandResult(-1, out + "\n[被中断]");
        }
        if (!exited) {
            p.destroyForcibly();
            return new CommandResult(-1,
                    out + "\n[超时强杀，超过 " + timeout.toSeconds() + "s]");
        }
        if (truncated) {
            out.append("\n[output truncated at ").append(OUTPUT_CAP_BYTES).append(" bytes]");
        }
        return new CommandResult(p.exitValue(), out.toString().stripTrailing());
    }

    private static final int OUTPUT_CAP_BYTES = 8 * 1024;

    public record CommandResult(int exitCode, String output) {}

    /**
     * 把 yml 里的 code-path 解析成真正能被 ProcessBuilder 启动的路径。
     * 非 Windows 直接原样返回；Windows 下若是裸命令名（无路径分隔符、无扩展名），
     * 沿 PATH 按 .cmd/.bat/.exe 顺序找出实际文件。
     */
    private static String resolveExecutable(String configured) {
        if (!WINDOWS) return configured;
        if (configured.indexOf('\\') >= 0 || configured.indexOf('/') >= 0) return configured;
        if (configured.contains(".")) return configured; // 用户已显式带后缀

        String pathEnv = System.getenv("PATH");
        if (pathEnv == null || pathEnv.isBlank()) return configured;

        for (String dir : pathEnv.split(";")) {
            if (dir.isBlank()) continue;
            for (String ext : WIN_EXTS) {
                Path candidate = Paths.get(dir, configured + ext);
                if (Files.isRegularFile(candidate)) {
                    return candidate.toString();
                }
            }
        }
        return configured;
    }
}
