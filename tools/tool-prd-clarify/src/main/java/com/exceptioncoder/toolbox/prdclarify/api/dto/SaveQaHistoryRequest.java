package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 多轮澄清完成后，保存完整问答历史到会话。
 */
public record SaveQaHistoryRequest(@NotNull List<QaPairRequest> history) {}
