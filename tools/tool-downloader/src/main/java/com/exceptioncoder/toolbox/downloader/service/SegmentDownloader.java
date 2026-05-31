package com.exceptioncoder.toolbox.downloader.service;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.DownloadSegment;
import com.exceptioncoder.toolbox.downloader.domain.SegmentState;
import com.exceptioncoder.toolbox.downloader.service.engine.HttpEngine;
import com.exceptioncoder.toolbox.downloader.service.engine.RangeStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.function.BooleanSupplier;
import java.util.function.LongConsumer;

/**
 * 单分片下载 worker。无状态，由 DownloaderTaskService 用虚拟线程并发提交。
 *
 * 底层走 {@link HttpEngine}，引擎实现自行解决 stalled 问题：
 *   - JdkHttpEngine：内置守门狗
 *   - OkHttpEngine：原生 readTimeout
 *
 * 本类只管业务层重试 + 进度回调 + 协作式暂停。
 */
@Service
public class SegmentDownloader {

    private static final Logger log = LoggerFactory.getLogger(SegmentDownloader.class);
    private static final int CHUNK = 64 * 1024;

    private final DownloaderProperties props;

    public SegmentDownloader(DownloaderProperties props) {
        this.props = props;
    }

    public SegmentOutcome download(HttpEngine engine,
                                   URI url,
                                   DownloadSegment seg,
                                   FileChannel fc,
                                   LongConsumer progressCallback,
                                   BooleanSupplier shouldStop) {
        return download(engine, url, seg, fc, progressCallback, shouldStop, props.getSegmentRetryMax());
    }

    /**
     * @param maxRetries 本轮的最大重试次数。per-segment route fallback 场景下，调用方可传更小的数。
     */
    public SegmentOutcome download(HttpEngine engine,
                                   URI url,
                                   DownloadSegment seg,
                                   FileChannel fc,
                                   LongConsumer progressCallback,
                                   BooleanSupplier shouldStop,
                                   int maxRetries) {
        for (int attempt = seg.getAttempts(); attempt <= maxRetries; attempt++) {
            if (shouldStop.getAsBoolean()) {
                return SegmentOutcome.paused(attempt);
            }
            try {
                downloadOnce(engine, url, seg, fc, progressCallback, shouldStop);
                return SegmentOutcome.done(attempt + 1);
            } catch (HttpStatus429Exception e) {
                throw e;
            } catch (PausedException e) {
                return SegmentOutcome.paused(attempt + 1);
            } catch (IOException e) {
                String reason = e.getClass().getSimpleName() + ": " + e.getMessage();
                if (attempt >= maxRetries) {
                    log.warn("segment {}#{} [{}] 重试耗尽：{}",
                            seg.getTaskId(), seg.getSeqNo(), engine.name(), reason);
                    return SegmentOutcome.failed(attempt + 1, reason);
                }
                long base = props.getSegmentRetryBackoffBaseMs() * (1L << Math.min(attempt, 8));
                long capped = Math.min(base, props.getSegmentRetryBackoffMaxMs());
                long jitter = (long) (capped * (Math.random() - 0.5));
                long backoff = Math.max(100, capped + jitter);
                log.info("segment {}#{} [{}] attempt {}/{} 失败，{}ms 后重试：{}",
                        seg.getTaskId(), seg.getSeqNo(), engine.name(),
                        attempt + 1, maxRetries, backoff, reason);
                try {
                    Thread.sleep(backoff);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return SegmentOutcome.failed(attempt + 1, "interrupted during backoff");
                }
            }
        }
        return SegmentOutcome.failed(maxRetries + 1, "retry exhausted");
    }

    private void downloadOnce(HttpEngine engine,
                              URI url,
                              DownloadSegment seg,
                              FileChannel fc,
                              LongConsumer progressCallback,
                              BooleanSupplier shouldStop) throws IOException {
        long alreadyDone = seg.getBytesDownloaded();
        long from = seg.getOffsetBytes() + alreadyDone;
        long to = seg.getOffsetBytes() + seg.getLengthBytes() - 1;
        if (from > to) return;

        try (RangeStream rs = engine.openRange(url, from, to)) {
            int code = rs.statusCode();
            if (code == 429) {
                throw new HttpStatus429Exception();
            }
            if (code != 206 && code != 200) {
                throw new IOException("unexpected HTTP " + code + " for Range " + from + "-" + to);
            }
            InputStream in = rs.body();
            ByteBuffer buf = ByteBuffer.allocate(CHUNK);
            byte[] tmp = new byte[CHUNK];
            long writeOffset = from;
            int n;
            while ((n = in.read(tmp)) >= 0) {
                if (n == 0) continue;
                if (shouldStop.getAsBoolean()) {
                    throw new PausedException();
                }
                buf.clear();
                buf.put(tmp, 0, n);
                buf.flip();
                while (buf.hasRemaining()) {
                    int w = fc.write(buf, writeOffset + (n - buf.remaining()));
                    if (w <= 0) throw new IOException("file channel write returned " + w);
                }
                writeOffset += n;
                progressCallback.accept(n);
            }
        }
    }

    public record SegmentOutcome(SegmentState state, int attemptsConsumed, String error) {
        public static SegmentOutcome done(int attempts) { return new SegmentOutcome(SegmentState.DONE, attempts, null); }
        public static SegmentOutcome failed(int attempts, String err) { return new SegmentOutcome(SegmentState.FAILED, attempts, err); }
        public static SegmentOutcome paused(int attempts) { return new SegmentOutcome(SegmentState.PENDING, attempts, null); }
    }

    /** 服务端 429，提示上层降并发后重排。 */
    public static class HttpStatus429Exception extends RuntimeException {
        public HttpStatus429Exception() { super("HTTP 429 Too Many Requests"); }
    }

    /** 协作式暂停的内部信号。 */
    private static class PausedException extends IOException {
        PausedException() { super("paused by user"); }
    }
}
