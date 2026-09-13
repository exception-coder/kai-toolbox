package com.exceptioncoder.toolbox.aichat.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** 纯模型通道不可升级为 Agent；省略字段兼容已有客户端。 */
public final class CompletionControlPolicy {
    private CompletionControlPolicy() { }

    public static void requireLlm(String mode) {
        if (mode != null && !"LLM".equals(mode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "此接口仅支持 LLM 控制模式；Code Agent 使用独立会话通道");
        }
    }
}
