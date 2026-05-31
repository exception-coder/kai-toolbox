package com.exceptioncoder.toolbox.hosts.api.dto;

/** 主机连通性测试结果 */
public record TestHostResult(boolean ok, String message) {}
