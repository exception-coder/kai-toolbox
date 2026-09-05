package com.exceptioncoder.toolbox.claudechat.service.autopilot;

/** Sidecar 完整收口且 Java 已接受的单轮终态。 */
public record SessionTurnSettledEvent(String sessionId, String turnId, String stopReason,
                                      boolean queueReleaseSafe, long settledAt) {
}
