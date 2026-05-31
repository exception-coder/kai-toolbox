package com.exceptioncoder.toolbox.vscodetunnel.api.dto;

/**
 * 启动隧道的入参。tunnelName 为空时使用 application.yml 配置的默认名。
 */
public record StartRequest(String tunnelName) {
}
