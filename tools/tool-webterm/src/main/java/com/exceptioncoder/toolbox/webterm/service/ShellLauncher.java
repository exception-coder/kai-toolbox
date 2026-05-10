package com.exceptioncoder.toolbox.webterm.service;

import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import com.pty4j.WinSize;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@Component
public class ShellLauncher {

    public static final String SHELL_POWERSHELL = "powershell";
    public static final String SHELL_CMD        = "cmd";

    public boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("windows");
    }

    public boolean isShellSupported(String shell) {
        return SHELL_POWERSHELL.equals(shell) || SHELL_CMD.equals(shell);
    }

    public Path resolveCwd(String requested) {
        if (requested == null || requested.isBlank()) {
            return Path.of(System.getProperty("user.home"));
        }
        Path p = Path.of(requested);
        if (!Files.isDirectory(p)) {
            return Path.of(System.getProperty("user.home"));
        }
        return p;
    }

    /**
     * 通过 ConPTY 启动一个真伪终端 + Shell。子进程认为 stdin/stdout 是真 console，
     * PowerShell 的 PSReadLine 会自动启用，前端就能拿到行编辑、Tab 补全、方向键历史。
     */
    public PtyProcess launch(String shell, Path cwd, int cols, int rows) throws IOException {
        if (!isWindows()) {
            throw new IOException("当前 OS 不支持 Web 终端：仅 Windows 启用");
        }
        String[] command = switch (shell) {
            case SHELL_POWERSHELL -> new String[] {
                    "powershell.exe",
                    "-NoLogo",
                    "-NoProfile",
                    "-ExecutionPolicy", "Bypass"
            };
            case SHELL_CMD -> new String[] {
                    "cmd.exe", "/K", "chcp 65001>nul"
            };
            default -> throw new IOException("不支持的 shell: " + shell);
        };

        Map<String, String> env = new HashMap<>(System.getenv());
        // pty4j 需要 TERM 让子进程知道终端类型；xterm-256color 是 xterm.js 的兼容 profile
        env.putIfAbsent("TERM", "xterm-256color");

        return new PtyProcessBuilder()
                .setCommand(command)
                .setDirectory(cwd.toString())
                .setEnvironment(env)
                .setInitialColumns(Math.max(20, cols))
                .setInitialRows(Math.max(5, rows))
                .setConsole(false)            // 启用 ConPTY，stdin/stdout 走伪终端
                .setUseWinConPty(true)        // Windows 下显式用 ConPTY，旧版 winpty 不再用
                .setRedirectErrorStream(true) // PTY 模式下 stderr 与 stdout 合流，与本地终端体验一致
                .start();
    }

    /** 同步终端尺寸到 PTY；PowerShell 会重排行宽。 */
    public void resize(PtyProcess process, int cols, int rows) {
        if (process == null || !process.isAlive()) return;
        process.setWinSize(new WinSize(Math.max(20, cols), Math.max(5, rows)));
    }
}
