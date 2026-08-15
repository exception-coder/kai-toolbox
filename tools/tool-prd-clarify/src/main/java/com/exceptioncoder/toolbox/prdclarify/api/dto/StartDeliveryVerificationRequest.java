package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 启动 Delivery 白名单验证的请求。
 *
 * @param commandId 服务端白名单命令 ID
 */
public record StartDeliveryVerificationRequest(String commandId) {
}
