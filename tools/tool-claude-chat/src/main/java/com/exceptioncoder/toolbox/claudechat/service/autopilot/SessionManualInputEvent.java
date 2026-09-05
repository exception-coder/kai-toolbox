package com.exceptioncoder.toolbox.claudechat.service.autopilot;

/** 用户发送、追加或排队消息前触发的自动监督接管信号。 */
public record SessionManualInputEvent(String sessionId, String action) {
}
