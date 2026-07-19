package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 生成/重新生成开发文档的请求体。
 *
 * @param extraInstructions 用户在生成前弹框里补充的自定义提示词（可选，null/空表示不追加），
 *                          拼进 buildDevDocPrompt 的 user prompt，让 Claude 生成时额外注意。
 */
public record GenerateDevDocRequest(String extraInstructions) {
}
