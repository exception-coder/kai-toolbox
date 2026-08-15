package com.exceptioncoder.toolbox.prdclarify.delivery;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** 通过显式 git argv 读取项目当前提交身份。 */
@Component
public class DeliveryGitHeadResolver {

    private static final Pattern GIT_SHA = Pattern.compile("[0-9a-fA-F]{40}");

    /** 返回项目当前 40 位 HEAD；非 Git 工作树时明确失败。 */
    public String resolve(Path projectRoot) {
        try {
            Process process = new ProcessBuilder("git", "rev-parse", "HEAD")
                    .directory(projectRoot.toFile())
                    .redirectErrorStream(true)
                    .start();
            boolean finished = process.waitFor(10, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new IllegalStateException("读取 Git HEAD 超时");
            }
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (process.exitValue() != 0 || !GIT_SHA.matcher(output).matches()) {
                throw new IllegalStateException("项目不是可识别的 Git 工作树");
            }
            return output.toLowerCase();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("读取 Git HEAD 被中断", exception);
        } catch (Exception exception) {
            if (exception instanceof IllegalStateException stateException) {
                throw stateException;
            }
            throw new IllegalStateException("读取 Git HEAD 失败", exception);
        }
    }
}
