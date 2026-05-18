package com.exceptioncoder.toolbox.browserrequest.api.dto;

/**
 * 「从响应提取变量到某条 SavedRequest」的请求体。
 *   - name         变量名（写入 saved.outputs，跨 saved 唯一）
 *   - jsonPath     从 responseBody 提取的路径
 *   - responseBody 提取来源（一般来自 RequestExecutor 的最近响应）
 */
public record ExtractToSavedRequest(String name, String jsonPath, String responseBody) {}
