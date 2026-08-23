package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** OpenSpec CLI 基础设施适配器，负责 argv 隔离、超时和输出截断。 */
@Component
public class OpenSpecCliGateway {

    private static final Logger LOGGER = LoggerFactory.getLogger(OpenSpecCliGateway.class);
    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase().contains("win");
    private static final long COMMAND_TIMEOUT_SECONDS = 90L;
    private static final int MAX_OUTPUT_LENGTH = 16_000;

    /**
     * 在指定项目目录执行 OpenSpec 子命令。
     *
     * @param projectDirectory 已校验的项目目录
     * @param arguments OpenSpec 子命令参数
     * @return 结构化命令结果
     */
    public CommandResult run(Path projectDirectory, List<String> arguments) {
        Path outputFile = null;
        try {
            outputFile = Files.createTempFile("kai-openspec-", ".log");
            Process process = new ProcessBuilder(command(arguments))
                    .directory(projectDirectory.toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(outputFile.toFile())
                    .start();
            boolean completed = process.waitFor(COMMAND_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!completed) {
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
                return new CommandResult(true, true, -1, readOutput(outputFile));
            }
            return new CommandResult(true, false, process.exitValue(), readOutput(outputFile));
        } catch (IOException e) {
            return new CommandResult(false, false, -1, e.getMessage() == null ? "OpenSpec CLI 启动失败" : e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new CommandResult(true, true, -1, "OpenSpec CLI 执行被中断");
        } finally {
            deleteTemporaryOutput(outputFile);
        }
    }

    /** 构造跨平台且不经字符串拼接的 OpenSpec 命令。 */
    private List<String> command(List<String> arguments) {
        List<String> command = new ArrayList<>(arguments.size() + (WINDOWS ? 5 : 1));
        if (WINDOWS) {
            command.add("cmd.exe");
            command.add("/d");
            command.add("/s");
            command.add("/c");
        }
        command.add("openspec");
        command.addAll(arguments);
        return command;
    }

    /** 读取并限制返回给调用方的诊断信息长度。 */
    private String readOutput(Path outputFile) throws IOException {
        String output = Files.readString(outputFile, StandardCharsets.UTF_8).trim();
        return output.length() <= MAX_OUTPUT_LENGTH
                ? output : output.substring(output.length() - MAX_OUTPUT_LENGTH);
    }

    /** 尽力删除单次命令的临时输出文件。 */
    private void deleteTemporaryOutput(Path outputFile) {
        if (outputFile == null) {
            return;
        }
        try {
            Files.deleteIfExists(outputFile);
        } catch (IOException e) {
            LOGGER.debug("无法删除 OpenSpec 临时输出文件: {}", outputFile, e);
        }
    }

    /**
     * @param started CLI 进程是否成功启动
     * @param timedOut 是否因超时或中断结束
     * @param exitCode 进程退出码，未正常结束为 -1
     * @param output 合并并截断后的标准输出和错误输出
     */
    public record CommandResult(boolean started, boolean timedOut, int exitCode, String output) {
    }
}
