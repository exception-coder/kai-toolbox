package com.exceptioncoder.toolbox.browserrequest.api.dto;

import com.exceptioncoder.toolbox.browserrequest.domain.FlowAction;

import java.util.List;

/** 确认并保存一段 AI 用例（人工确认后落库）。 */
public record SaveFlowRequest(String name, String instruction, List<FlowAction> steps) {}
