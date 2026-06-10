package com.exceptioncoder.toolbox.browserrequest.api.dto;

import com.exceptioncoder.toolbox.browserrequest.domain.FlowAction;

import java.util.List;

/** 执行一段（尚未落库的）AI 用例脚本。 */
public record RunFlowRequest(List<FlowAction> steps) {}
