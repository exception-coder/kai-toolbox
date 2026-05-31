package com.exceptioncoder.toolbox.downloader.service.engine;

import java.io.IOException;
import java.io.InputStream;

/**
 * Range 请求的流式响应。
 * 调用方必须 close（推荐 try-with-resources）以释放底层 socket。
 * stream 上的 read 不会无限阻塞——具体由引擎实现保证（守门狗或 readTimeout）。
 */
public final class RangeStream implements AutoCloseable {

    private final int statusCode;
    private final EngineHeaders headers;
    private final InputStream body;
    private final Runnable onClose;

    public RangeStream(int statusCode, EngineHeaders headers, InputStream body, Runnable onClose) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.body = body;
        this.onClose = onClose == null ? () -> {} : onClose;
    }

    public int statusCode() { return statusCode; }
    public EngineHeaders headers() { return headers; }
    public InputStream body() { return body; }

    @Override
    public void close() {
        try { body.close(); } catch (IOException ignored) { /* best-effort */ }
        onClose.run();
    }
}
