package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 单条澄清问题（含用户填写的答案）。
 *
 * @param id       问题序号（1-based）
 * @param question 问题内容
 * @param answer   用户填写的答案（未填时为空字符串）
 */
public record QuestionItem(int id, String question, String answer) {
}
