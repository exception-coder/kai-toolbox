package com.exceptioncoder.toolbox.webterm.service;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

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

    /**
     * 解析有效 cwd：null 或不存在则回退 user.home。
     */
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

    public Process launch(String shell, Path cwd) throws IOException {
        if (!isWindows()) {
            throw new IOException("当前 OS 不支持 Web 终端：仅 Windows 启用");
        }
        List<String> command = switch (shell) {
            case SHELL_POWERSHELL -> List.of(
                    "powershell.exe",
                    "-NoLogo",
                    "-NoProfile",
                    "-ExecutionPolicy", "Bypass",
                    "-Command",
                    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;" +
                            "$OutputEncoding=[System.Text.Encoding]::UTF8;" +
                            "powershell.exe -NoLogo -NoProfile"
            );
            case SHELL_CMD -> List.of(
                    "cmd.exe",
                    "/K", "chcp 65001>nul"
            );
            default -> throw new IOException("不支持的 shell: " + shell);
        };

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(cwd.toFile());
        pb.redirectErrorStream(false);
        return pb.start();
    }
}
