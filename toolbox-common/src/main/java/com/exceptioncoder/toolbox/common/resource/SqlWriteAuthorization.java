package com.exceptioncoder.toolbox.common.resource;

import java.util.UUID;

/** Agent 对本次用户授权的声明，用于审计；不等同于服务端独立核验的人审凭证。 */
public record SqlWriteAuthorization(String sessionId, String userInstruction, String scope, String requestId) {
    public void validate() {
        requireText(sessionId, "会话身份", 200);
        requireText(userInstruction, "用户明确授权原话", 2000);
        requireText(scope, "本次授权适用范围", 2000);
        requireText(requestId, "稳定请求 ID", 36);
        try {
            if (!UUID.fromString(requestId).toString().equalsIgnoreCase(requestId)) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("SQL 写入请求 ID 必须为 UUID；重试沿用原 ID");
        }
    }

    private static void requireText(String text, String name, int maxLength) {
        if (text == null || text.isBlank() || text.length() > maxLength) {
            throw new IllegalArgumentException("WRITE_AUTHORIZATION_REQUIRED: 请提供" + name + "（最多 " + maxLength + " 字符）");
        }
    }
}
