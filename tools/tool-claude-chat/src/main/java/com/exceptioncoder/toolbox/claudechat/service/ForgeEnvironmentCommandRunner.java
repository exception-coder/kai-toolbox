package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** 执行 Forge 环境白名单命令，统一处理 Windows shim、超时与输出截断。 */
@Component("claudeChatForgeEnvironmentCommandRunner")
public class ForgeEnvironmentCommandRunner {

    private static final boolean WINDOWS = System.getProperty("os.name", "")
            .toLowerCase(Locale.ROOT).contains("win");
    private static final int MAX_OUTPUT_LENGTH = 16_000;

    /**
     * 执行调用方代码内声明的固定 argv。
     *
     * @param command 固定命令及参数
     * @param timeout 最长执行时间
     * @param workingDirectory 可选工作目录
     * @param outputConsumer 可选逐行输出消费者
     * @return 有界命令结果
     */
    public CommandResult run(List<String> command, Duration timeout, Path workingDirectory,
                             Consumer<String> outputConsumer) {
        Process process = null;
        try {
            ProcessBuilder builder = new ProcessBuilder(wrap(command)).redirectErrorStream(true);
            if (workingDirectory != null) {
                builder.directory(workingDirectory.toFile());
            }
            process = builder.start();
            Process started = process;
            StringBuilder output = new StringBuilder();
            Thread reader = Thread.ofVirtual().name("forge-environment-command-output").start(() ->
                    drain(started, output, outputConsumer));
            boolean completed = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!completed) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
            }
            reader.join(2_000L);
            return new CommandResult(completed ? process.exitValue() : -1, completed,
                    truncate(output.toString()));
        } catch (IOException exception) {
            return new CommandResult(-1, false, compact(exception.getMessage(), "命令无法启动"));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            if (process != null) {
                process.destroyForcibly();
            }
            return new CommandResult(-1, false, "命令执行被中断");
        }
    }

    private void drain(Process process, StringBuilder output, Consumer<String> outputConsumer) {
        try (var reader = process.inputReader(StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                synchronized (output) {
                    if (output.length() < MAX_OUTPUT_LENGTH) {
                        if (!output.isEmpty()) {
                            output.append(System.lineSeparator());
                        }
                        output.append(line);
                    }
                }
                if (outputConsumer != null) {
                    outputConsumer.accept(line);
                }
            }
        } catch (IOException ignored) {
            // 进程被超时终止时读流关闭，结果由 exitCode/timedOut 表达。
        }
    }

    private static List<String> wrap(List<String> command) {
        if (!WINDOWS) {
            return command;
        }
        List<String> wrapped = new ArrayList<>(command.size() + 4);
        wrapped.add("cmd.exe");
        wrapped.add("/d");
        wrapped.add("/s");
        wrapped.add("/c");
        wrapped.addAll(command);
        return wrapped;
    }

    private static String truncate(String output) {
        String value = output == null ? "" : output.trim();
        return value.length() <= MAX_OUTPUT_LENGTH
                ? value : value.substring(value.length() - MAX_OUTPUT_LENGTH);
    }

    private static String compact(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.replaceAll("\\s+", " ").trim();
    }

    /**
     * @param exitCode 进程退出码，未正常结束为 -1
     * @param completed 是否在时限内正常结束
     * @param output 合并并截断后的输出
     */
    public record CommandResult(int exitCode, boolean completed, String output) {
        /** @return 命令是否成功完成 */
        public boolean succeeded() {
            return completed && exitCode == 0;
        }
    }
}
