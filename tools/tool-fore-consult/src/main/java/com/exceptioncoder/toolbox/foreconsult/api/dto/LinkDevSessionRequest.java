package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 回写关联的 claude-chat 会话 id 的请求体（拉起悬浮会话后由前端调用）。
 *
 * @param devSessionId claude-chat 的 chat.sessionId
 */
public record LinkDevSessionRequest(
        @NotBlank String devSessionId
) {
}
