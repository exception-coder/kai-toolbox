package com.exceptioncoder.toolbox.aisecretary.service;

/** 回忆态 agent loop 的一步（一次工具调用），用于经 SSE 推到前端可视化。 */
public record RecallStep(String tool, String args, String result) {
}
