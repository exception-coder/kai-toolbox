package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.common.git.GitProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** 项目 Git 命令边界：非交互、有界读取、超时清理子进程，参数不经过 shell。 */
@Component
public class ProjectGitCommand {
    private static final int OUTPUT_LIMIT = 2 * 1024 * 1024;
    private final GitProperties properties;

    public ProjectGitCommand(GitProperties properties) {
        this.properties = properties;
    }

    /** 执行已构造的 Git 参数，返回退出码与输出，超限或超时明确失败。 */
    public Result run(Path root, Duration timeout, String... arguments) {
        Path output = null;
        Process process = null;
        try {
            output = Files.createTempFile("forge-project-git-", ".log");
            var command = new ArrayList<>(List.of(properties.getBinary(), "-c", "core.quotepath=false",
                    "-c", "credential.interactive=false", "-C", root.toString()));
            command.addAll(List.of(arguments));
            ProcessBuilder builder = new ProcessBuilder(command).redirectErrorStream(true)
                    .redirectOutput(output.toFile());
            builder.environment().put("GIT_TERMINAL_PROMPT", "0");
            builder.environment().put("GCM_INTERACTIVE", "Never");
            builder.environment().put("GIT_SSH_COMMAND", "ssh -oBatchMode=yes");
            process = builder.start();
            if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                stop(process);
                throw new IllegalStateException("Git 操作超时，结果未确认；请先核对远端状态再重试");
            }
            try (var input = Files.newInputStream(output)) {
                byte[] bytes = input.readNBytes(OUTPUT_LIMIT + 1);
                if (bytes.length > OUTPUT_LIMIT) {
                    throw new IllegalStateException("Git 输出超过 2 MiB，请在本机 Git 中查看完整工作区");
                }
                return new Result(process.exitValue(), new String(bytes, StandardCharsets.UTF_8));
            }
        } catch (IOException exception) {
            throw new IllegalStateException("无法执行 Git，请检查本机 Git 配置", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            if (process != null) {
                stop(process);
            }
            throw new IllegalStateException("Git 操作已中断，请刷新后核对状态", exception);
        } finally {
            if (output != null) {
                try {
                    Files.deleteIfExists(output);
                } catch (IOException exception) {
                    output.toFile().deleteOnExit();
                }
            }
        }
    }

    private void stop(Process process) {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
    }

    /** 去除 Git 输出中可能包含凭据的 URL 与查询参数。 */
    public static String sanitize(String output) {
        return output.replaceAll("(?i)(https?|ssh)://[^\\s]+", "[远端地址]")
                .replaceAll("(?i)(token|password|authorization)[=:]\\s*\\S+", "$1=[已隐藏]");
    }

    /** 命令执行结果。 */
    public record Result(/** 退出码。 */ Integer exitCode, /** 命令输出。 */ String output) {
        /** 要求命令成功，失败信息仅提供脱敏输出。 */
        public String requireSuccess() {
            if (exitCode != 0) {
                throw new IllegalStateException("Git 操作失败：" + sanitize(output).strip());
            }
            return output;
        }
    }
}
