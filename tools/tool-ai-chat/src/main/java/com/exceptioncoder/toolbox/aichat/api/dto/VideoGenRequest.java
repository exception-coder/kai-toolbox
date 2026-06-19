package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 视频生成请求（提交）。
 *
 * @param model   视频模型 id（category=video，如 sora-2）
 * @param prompt  提示词
 * @param seconds 时长秒数（如 4/8/12）；空则用网关默认
 * @param size    分辨率（如 1280x720 / 720x1280）；空则用网关默认
 */
public record VideoGenRequest(String model, String prompt, String seconds, String size) {
}
