package com.exceptioncoder.toolbox.downloader.service;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.HttpEngineType;
import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;
import com.exceptioncoder.toolbox.downloader.domain.RouteDecision;
import com.exceptioncoder.toolbox.downloader.domain.RouteType;
import com.exceptioncoder.toolbox.downloader.service.engine.EngineHeaders;
import com.exceptioncoder.toolbox.downloader.service.engine.HttpEngine;
import com.exceptioncoder.toolbox.downloader.service.engine.HttpEngineFactory;
import com.exceptioncoder.toolbox.downloader.service.engine.ProbeResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

/**
 * 直连 vs 代理 race。
 * 用 HttpEngine 抽象层：JDK / OkHttp 都能跑 race，由调用方传入 HttpEngineType。
 * race 用临时 engine，race 完毕全部释放；下载用新创建的长期 engine。
 */
@Service
public class RouteProber {

    private static final Logger log = LoggerFactory.getLogger(RouteProber.class);

    private final DownloaderProperties props;
    private final HttpEngineFactory engineFactory;

    public RouteProber(DownloaderProperties props, HttpEngineFactory engineFactory) {
        this.props = props;
        this.engineFactory = engineFactory;
    }

    public RaceResult race(URI url, Optional<ProxyCandidate> proxy, HttpEngineType engineType) {
        long probeBytes = props.getProbeBytes();
        Duration timeout = Duration.ofMillis(props.getProbeTimeoutMs());

        CompletableFuture<ProbeOutcome> direct = probeAsync(url, Optional.empty(), probeBytes, timeout, engineType);
        CompletableFuture<ProbeOutcome> viaProxy = proxy
                .map(p -> probeAsync(url, Optional.of(p), probeBytes, timeout, engineType))
                .orElseGet(() -> CompletableFuture.completedFuture(ProbeOutcome.unavailable()));

        ProbeOutcome d = direct.join();
        ProbeOutcome p = viaProxy.join();

        RouteDecision decision;
        EngineHeaders winnerHeaders;
        if (d.success && p.success) {
            boolean proxyWins = p.throughputBps > d.throughputBps
                    || (p.throughputBps == d.throughputBps && p.ttfbMs < d.ttfbMs);
            RouteType route = proxyWins ? RouteType.PROXY : RouteType.DIRECT;
            log.info("route race ({}) for {} → {} (direct {}KB/s TTFB {}ms, proxy {}KB/s TTFB {}ms)",
                    engineType, url, route, d.throughputBps / 1024, d.ttfbMs, p.throughputBps / 1024, p.ttfbMs);
            decision = new RouteDecision(route,
                    route == RouteType.PROXY ? proxy.get().originUrl() : null,
                    d.ttfbMs, d.throughputBps, p.ttfbMs, p.throughputBps, Instant.now());
            winnerHeaders = proxyWins ? p.headers : d.headers;
        } else if (d.success) {
            decision = RouteDecision.directOnly(d.ttfbMs, d.throughputBps);
            winnerHeaders = d.headers;
        } else if (p.success) {
            decision = RouteDecision.proxyOnly(proxy.get().originUrl(), p.ttfbMs, p.throughputBps);
            winnerHeaders = p.headers;
        } else {
            String reason = "direct: " + d.error + " | proxy: " + p.error;
            throw new UnreachableException("两条链路均无法访问目标 URL：" + reason);
        }
        return new RaceResult(decision, winnerHeaders);
    }

    private CompletableFuture<ProbeOutcome> probeAsync(URI url, Optional<ProxyCandidate> proxy,
                                                       long probeBytes, Duration timeout,
                                                       HttpEngineType engineType) {
        return CompletableFuture.supplyAsync(() -> {
            try (HttpEngine engine = engineFactory.create(engineType, proxy)) {
                ProbeResult r = engine.probe(url, probeBytes, timeout);
                if (r.statusCode() >= 400) {
                    return ProbeOutcome.failed("HTTP " + r.statusCode());
                }
                long bytes = r.body() == null ? 0 : r.body().length;
                long throughputBps = bytes <= 0 ? 0 : (long) (bytes * 1000.0 / Math.max(1, r.ttfbMs()));
                return ProbeOutcome.ok(r.ttfbMs(), throughputBps, r.headers());
            } catch (Exception e) {
                return ProbeOutcome.failed(e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        });
    }

    /** Race 内部使用的探测结果。 */
    private record ProbeOutcome(boolean success, long ttfbMs, long throughputBps, EngineHeaders headers, String error) {
        static ProbeOutcome ok(long ttfb, long bps, EngineHeaders h) { return new ProbeOutcome(true, ttfb, bps, h, null); }
        static ProbeOutcome failed(String err) { return new ProbeOutcome(false, 0, 0, null, err); }
        static ProbeOutcome unavailable() { return new ProbeOutcome(false, 0, 0, null, "no proxy"); }
    }

    /** race 对外返回：决策 + 胜方响应头 */
    public record RaceResult(RouteDecision decision, EngineHeaders winnerHeaders) {}

    /** 两条链路全部不可达时抛出，Spring 自动映射 502。 */
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.BAD_GATEWAY)
    public static class UnreachableException extends RuntimeException {
        public UnreachableException(String msg) { super(msg); }
    }
}
