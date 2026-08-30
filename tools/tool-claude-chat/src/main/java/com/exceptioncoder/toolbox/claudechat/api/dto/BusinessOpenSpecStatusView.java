package com.exceptioncoder.toolbox.claudechat.api.dto;

/** 一个业务仓库的 OpenSpec 根与双端 Agent Skill 就绪状态。 */
public record BusinessOpenSpecStatusView(
        boolean initialized,
        boolean claudeConfigured,
        boolean codexConfigured,
        String status,
        String message) {
}
