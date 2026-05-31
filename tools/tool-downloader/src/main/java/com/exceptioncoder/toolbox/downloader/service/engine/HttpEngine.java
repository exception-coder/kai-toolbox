package com.exceptioncoder.toolbox.downloader.service.engine;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;

/**
 * HTTP 客户端抽象。覆盖下载器需要的两个核心能力：
 *   1) probe：阻塞拉一段 Range body（race 探测用）
 *   2) openRange：流式拉 Range（分片下载用）
 *
 * 实现需自行解决 stalled 问题：
 *   - JdkHttpEngine：用 ScheduledExecutorService 守门狗 close stream
 *   - OkHttpEngine：靠 OkHttp 内置 readTimeout
 *
 * 每个 HttpEngine 实例绑定一种代理设置（NO_PROXY 或一个具体代理）；任务上下文持有 1-2 个实例。
 * 关闭时释放底层连接池。
 */
public interface HttpEngine extends AutoCloseable {

    /** 引擎名，用于日志和前端展示，如 "JDK" / "OkHttp" */
    String name();

    /**
     * 探测请求：阻塞拉完整 N 字节 + 解析响应头 + 测 TTFB。
     * race 路径使用。
     *
     * @param totalTimeout 整个请求的总超时（连接 + 头 + body）
     */
    ProbeResult probe(URI url, long bytes, Duration totalTimeout) throws IOException;

    /**
     * 流式 Range 下载：发 GET，返回响应头 + InputStream。
     * 调用方负责 read + close（try-with-resources）。
     * 实现必须保证 stream 上的 read() 不会无限阻塞（守门狗或 readTimeout）。
     */
    RangeStream openRange(URI url, long from, long to) throws IOException;

    @Override
    void close();
}
