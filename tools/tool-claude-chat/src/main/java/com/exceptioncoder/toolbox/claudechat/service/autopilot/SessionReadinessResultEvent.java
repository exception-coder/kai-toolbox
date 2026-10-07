package com.exceptioncoder.toolbox.claudechat.service.autopilot;

/** 宿主接受的前置校验结果；不依赖 Agent 将工具失败再次上报。 */
public record SessionReadinessResultEvent(String sessionId, String turnId, String toolCallId,
                                          String toolName, String output, boolean error) { }
