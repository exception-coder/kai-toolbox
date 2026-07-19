package com.exceptioncoder.toolbox.prdclarify.api.dto;

import java.util.List;

/**
 * 请求 Claude 就"开发文档更新"提出下一个澄清问题的参数。
 *
 * @param questionIndex 当前是第几轮（0-based）
 * @param history       已完成的问答历史（按时间顺序）
 * @param updateNotes   用户对本次更新的初步描述（来自 DevDocUpdateDialog 输入 + 附件），
 *                      每轮都会拼进 prompt，让 Claude 始终围绕"这次到底要改什么"提问
 */
public record AskNextDevDocQuestionRequest(
        int questionIndex,
        List<QaPairRequest> history,
        String updateNotes
) {}
