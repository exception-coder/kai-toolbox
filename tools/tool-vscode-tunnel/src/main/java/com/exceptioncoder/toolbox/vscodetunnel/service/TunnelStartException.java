package com.exceptioncoder.toolbox.vscodetunnel.service;

/**
 * 启动 code tunnel 子进程时的可恢复错误（如 code CLI 不在 PATH）。
 * 由 GlobalExceptionHandler 兜底转 500，并把 message 透传给前端。
 */
public class TunnelStartException extends RuntimeException {

    public TunnelStartException(String message) {
        super(message);
    }

    public TunnelStartException(String message, Throwable cause) {
        super(message, cause);
    }
}
