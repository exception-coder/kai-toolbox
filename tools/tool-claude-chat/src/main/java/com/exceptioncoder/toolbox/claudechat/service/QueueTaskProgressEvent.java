package com.exceptioncoder.toolbox.claudechat.service;

/** 已持久化的队列进展；监听者只能更新该会话及消息关联的任务。 */
public record QueueTaskProgressEvent(String sessionId, String messageId, String status, String note) { }
