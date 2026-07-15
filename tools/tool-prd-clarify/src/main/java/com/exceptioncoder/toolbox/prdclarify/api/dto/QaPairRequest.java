package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 多轮澄清对话中的单条问答对（由前端传入历史记录）。
 *
 * @param question Claude 提出的问题
 * @param answer   用户填写的答案
 */
public record QaPairRequest(String question, String answer) {}
