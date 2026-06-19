package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * 一次补全的调试快照：后端真实发往网关的请求参数与上下文 + 网关真实返回的关键元数据。
 * 用于排障与核验「请求是否正常 / 上游是否动过手脚」——尤其 responseModel（上游回显的模型名）、
 * finishReason、tokenUsage 三项最能暴露异常。
 *
 * @param requestedAt      请求发起时刻（epoch ms）
 * @param baseUrl          实际请求的网关基址（含 /v1）
 * @param model            请求的模型（含 effort 后缀的具体变体）
 * @param temperatureSent  实际下发的温度；推理模型不下发时为 null
 * @param maxTokens        实际下发的 maxTokens；未设为 null
 * @param messages         实际发送的完整上下文（系统/历史/当前），图片以计数表示、不含 base64
 * @param status           DONE / INTERRUPTED / ERROR
 * @param responseModel    上游返回元数据里回显的模型名（与 model 不一致即可疑）；无则 null
 * @param finishReason     上游结束原因（stop / length / ...）；无则 null
 * @param latencyMs        本轮耗时（ms）
 * @param promptTokens     输入 token
 * @param completionTokens 输出 token
 * @param totalTokens      总 token
 * @param cachedTokens     命中缓存 token
 * @param responseChars    返回正文字符数
 * @param error            错误信息；无错为 null
 */
public record CompletionDebug(
        long requestedAt,
        String baseUrl,
        String model,
        Double temperatureSent,
        Integer maxTokens,
        List<DebugMessage> messages,
        String status,
        String responseModel,
        String finishReason,
        Long latencyMs,
        Long promptTokens,
        Long completionTokens,
        Long totalTokens,
        Long cachedTokens,
        Integer responseChars,
        String error) {

    /**
     * 上下文中的一条消息。
     *
     * @param role   SYSTEM / USER / ASSISTANT
     * @param text   文本内容（过长截断）
     * @param images 该消息携带的图片数量
     */
    public record DebugMessage(String role, String text, int images) {
    }
}
