package com.exceptioncoder.toolbox.claudechat.service;

/** 队列持久化成功后的调度提示；周期巡检是丢失提示时的兜底。 */
public record QueueChangedEvent(String sessionId) { }
