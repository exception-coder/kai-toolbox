package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import org.springframework.stereotype.Service;
import java.nio.file.Files;
import java.nio.file.Path;

/** 仅传服务端保存的会话环境；独立目录和原生会话，不继承源执行句柄。 */
@Service
public class PlanReviewRunner {
    private final SidecarClient sidecar;
    public PlanReviewRunner(SidecarClient sidecar) { this.sidecar = sidecar; }
    public Result run(ClaudeChatSession source, String attemptId, String engine, String prompt) throws Exception {
        Path root = Path.of(System.getProperty("user.home"), ".kai-toolbox", "reviews", "plan-" + attemptId);
        Files.createDirectories(root);
        var result = sidecar.planReview(source.getId(), attemptId, engine, root.toString(), prompt,
                source.getCodexHome(), source.getApiBaseUrl(), source.getAuthToken());
        if (result.hasNonNull("error") || result.path("text").asText().isBlank()) {
            throw new ReviewFailure(switch (result.path("error").asText()) {
                case "TIMEOUT" -> "引擎评审超时，已请求停止；请核对后重试。";
                case "BUSY" -> "评审引擎繁忙，请稍后重试。";
                case "CANCELLED" -> "本次引擎评审已停止或该尝试已经执行；未重复调用。";
                default -> "引擎未成功完成受限文字评审，请检查认证、模型或工具调用限制后重试。";
            });
        }
        String text = result.path("text").asText();
        if (text.length() > 120_000) throw new IllegalStateException("评审结果超过长度上限");
        return new Result(text, result.path("model").asText(null));
    }
    public void cancel(String attemptId) { sidecar.cancelPlanReview(attemptId); }
    public record Result(String text, String model) {}
    public static class ReviewFailure extends RuntimeException {
        public ReviewFailure(String message) { super(message); }
    }
}
