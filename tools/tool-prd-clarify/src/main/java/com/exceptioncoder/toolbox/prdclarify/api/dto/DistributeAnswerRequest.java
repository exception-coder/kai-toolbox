package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 批量澄清模式的「一次性回答」：用户把对全部澄清问题的回答写成一整段，请求服务端拆分归位到各题。
 *
 * @param rawAnswer 用户一次性写下的整段回答原文
 */
public record DistributeAnswerRequest(@NotBlank String rawAnswer) {}
