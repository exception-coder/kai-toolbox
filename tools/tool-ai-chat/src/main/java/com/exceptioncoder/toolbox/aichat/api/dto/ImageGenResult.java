package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * 绘图结果。
 *
 * @param images 生成图片地址（http URL 或 data: base64 URI）
 * @param model  实际使用的模型
 */
public record ImageGenResult(List<String> images, String model) {
}
