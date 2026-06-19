package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 绘图请求。
 *
 * @param model  绘图模型 id（category=image）
 * @param prompt 提示词
 * @param size   尺寸（如 1024x1024）；空则用默认
 * @param n      生成张数；空则 1
 */
public record ImageGenRequest(String model, String prompt, String size, Integer n) {
}
