package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 视频生成任务状态（提交返回 + 轮询返回共用）。
 *
 * @param id       任务 id
 * @param status   queued / in_progress / completed / failed 等（原样透传网关）
 * @param videoUrl 完成后的视频地址；未完成为 null
 * @param error    失败原因；无错为 null
 * @param model    使用的模型
 */
public record VideoTask(String id, String status, String videoUrl, String error, String model) {
}
