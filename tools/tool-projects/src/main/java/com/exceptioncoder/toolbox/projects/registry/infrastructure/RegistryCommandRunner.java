package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** 固定参数本机命令执行器，限制时间并将输出重定向到临时文件防止管道阻塞。 */
@Component
public class RegistryCommandRunner {
    private static final int OUTPUT_LIMIT = 8192;

    /** @param root 工作目录 @param command 独立参数列表 @param timeout 总超时 @return 退出码和截断输出。 */
    public Result run(Path root, List<String> command, Duration timeout) {
        Path output = null;
        Process process = null;
        try {
            output = Files.createTempFile("forge-registry-", ".log");
            process = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true)
                    .redirectOutput(output.toFile()).start();
            if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                stop(process);
                return new Result(-1, "命令执行超时，请检查本机工具后重试");
            }
            try (var input = Files.newInputStream(output)) {
                return new Result(process.exitValue(), new String(input.readNBytes(OUTPUT_LIMIT),
                        java.nio.charset.StandardCharsets.UTF_8));
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            if (process != null) {
                stop(process);
            }
            throw new IllegalStateException("初始化命令已中断", exception);
        } catch (IOException exception) {
            return new Result(-1, "本机工具不可用：" + command.getFirst());
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

    /** 命令执行证据，不包含环境变量或凭据。 */
    public record Result(/** 进程退出码。 */ Integer exitCode, /** 有界输出。 */ String output) { }
}
