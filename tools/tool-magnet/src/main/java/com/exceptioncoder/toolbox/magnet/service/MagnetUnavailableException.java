package com.exceptioncoder.toolbox.magnet.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * aria2 二进制不可用 / RPC 启动失败 时抛出，Spring 自动映射到 503。
 * 与 FfmpegUnavailableException 风格一致。
 */
@ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
public class MagnetUnavailableException extends RuntimeException {
    public MagnetUnavailableException(String msg) { super(msg); }
    public MagnetUnavailableException(String msg, Throwable cause) { super(msg, cause); }
}
