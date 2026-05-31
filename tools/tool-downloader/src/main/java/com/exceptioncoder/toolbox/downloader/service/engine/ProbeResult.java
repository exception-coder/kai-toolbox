package com.exceptioncoder.toolbox.downloader.service.engine;

/**
 * 探测请求结果。
 * statusCode &gt;= 400 时 body 可能为空或错误页；调用方按 statusCode 判定成功失败。
 */
public record ProbeResult(int statusCode, EngineHeaders headers, byte[] body, long ttfbMs) {
}
