package com.exceptioncoder.toolbox.prdclarify.domain;

/**
 * 一版不可变 Prompt 定义。
 *
 * @param purpose 业务用途
 * @param version 版本标识
 * @param systemPrompt 系统 Prompt 正文
 * @param sha256 UTF-8 正文 SHA-256
 */
public record PrdPromptDefinition(
        PrdPromptPurpose purpose,
        String version,
        String systemPrompt,
        String sha256
) {
}
