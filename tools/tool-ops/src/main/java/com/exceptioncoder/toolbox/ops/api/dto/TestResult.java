package com.exceptioncoder.toolbox.ops.api.dto;

/** 连接测试结果。ok=true 时 message 为服务端标识/版本，false 时为错误原因。 */
public record TestResult(boolean ok, String message, long elapsedMs) {}
