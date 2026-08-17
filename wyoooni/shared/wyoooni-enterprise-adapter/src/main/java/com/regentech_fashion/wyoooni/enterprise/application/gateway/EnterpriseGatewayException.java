package com.regentech_fashion.wyoooni.enterprise.application.gateway;

/** 公司统一业务网关调用失败。 */
public class EnterpriseGatewayException extends RuntimeException {
    private final int statusCode;
    private final String errorCode;

    public EnterpriseGatewayException(int statusCode, String errorCode, String message) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
    }

    public int statusCode() { return statusCode; }
    public String errorCode() { return errorCode; }
}
