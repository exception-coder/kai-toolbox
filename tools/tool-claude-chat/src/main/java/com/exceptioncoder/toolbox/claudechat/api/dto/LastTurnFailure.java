package com.exceptioncoder.toolbox.claudechat.api.dto;

/** 最近失败轮次的安全摘要，不保存原生提示词、凭据或日志正文。 */
public record LastTurnFailure(String turnId, long endedAt, TurnFailure failure) {}
