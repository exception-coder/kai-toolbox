package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * AI 建议的业务短标题及规范化完整标题。
 *
 * @param shortTitle 不含系统、模块前缀的业务标题
 * @param title      系统名-模块-业务标题
 */
public record SuggestTitleView(String shortTitle, String title) {
}
