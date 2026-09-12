package com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRequest;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/** 使用回环 HTTP 服务验证真实 SDK 的重试预算和整轮超时，无外部模型调用。 */
class AgentScopeTeachingTransportTest {
    @Test
    void retryBudgetIsAppliedOnceAndNoDraftIsFabricated() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger requests = new AtomicInteger();
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            byte[] response = "{\"error\":{\"message\":\"temporary test failure\"}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(500, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            var executor = executor(server);
            var config = config(1, 10);
            var result = executor.execute(config, new TeachingRequest(1L, "LIVE", null, "订 A123", null));
            assertThat(result.status()).isEqualTo("FAILED");
            assertThat(result.draft()).isNull();
            assertThat(requests.get()).isEqualTo(2);
            assertThat(result.answer()).doesNotContain("test-only-key", "temporary test failure");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void wholeTurnTimeoutStopsWaitingAndReturnsFailure() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            try {
                Thread.sleep(1500);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        try {
            long started = System.nanoTime();
            var result = executor(server).execute(config(0, 1),
                    new TeachingRequest(1L, "LIVE", null, "订 A123", null));
            assertThat(result.status()).isEqualTo("FAILED");
            assertThat(result.draft()).isNull();
            assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(2500);
        } finally {
            server.stop(0);
        }
    }

    private AgentScopeTeachingExecutor executor(HttpServer server) {
        var gateway = new LlmGatewayProperties();
        gateway.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1");
        gateway.setApiKey("test-only-key");
        return new AgentScopeTeachingExecutor(gateway);
    }

    private TeachingConfig config(int retries, int timeout) {
        var defaults = TeachingConfig.defaults();
        return new TeachingConfig("test", 0.1, defaults.prompt(), 1000, 6, timeout, retries, 1024, true);
    }
}
