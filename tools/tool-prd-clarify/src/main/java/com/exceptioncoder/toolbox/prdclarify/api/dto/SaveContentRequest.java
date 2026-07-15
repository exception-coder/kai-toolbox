package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 编辑器保存 PRD 文档内容的请求体。
 *
 * @param content 完整的 Markdown 内容
 */
public record SaveContentRequest(@NotNull String content) {
}
