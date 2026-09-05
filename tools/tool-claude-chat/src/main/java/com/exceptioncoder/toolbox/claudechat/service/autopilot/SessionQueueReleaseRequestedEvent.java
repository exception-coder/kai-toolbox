package com.exceptioncoder.toolbox.claudechat.service.autopilot;

/** 请求现有会话编排器在全链路门禁后释放一条持久队列消息。 */
public record SessionQueueReleaseRequestedEvent(String sessionId) {
}
