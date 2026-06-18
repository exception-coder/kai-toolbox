package com.exceptioncoder.toolbox.aichat.domain;

/**
 * 助手消息的终态。
 * 流式完成 = DONE；用户中途停止 = INTERRUPTED（保留已生成部分）；4sapi 调用失败 = ERROR。
 * 用户消息恒为 DONE。
 */
public enum MessageStatus {
    DONE,
    INTERRUPTED,
    ERROR
}
