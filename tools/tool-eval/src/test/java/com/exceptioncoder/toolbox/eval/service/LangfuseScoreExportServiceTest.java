package com.exceptioncoder.toolbox.eval.service;

import com.exceptioncoder.toolbox.eval.domain.EvalResult;
import com.exceptioncoder.toolbox.eval.repository.EvalResultRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

class LangfuseScoreExportServiceTest {

    @Test
    void exportsDeterministicScoresAfterLocalResultExists() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        CountDownLatch requests = new CountDownLatch(2);
        List<String> bodies = new CopyOnWriteArrayList<>();
        List<String> authorizations = new CopyOnWriteArrayList<>();
        server.createContext("/api/public/scores", exchange -> {
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorizations.add(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
            requests.countDown();
        });
        server.start();
        try {
            EvalResultRepository repository = mock(EvalResultRepository.class);
            AgentTelemetryProperties properties = properties(server.getAddress().getPort());
            LangfuseScoreExportService service = new LangfuseScoreExportService(
                    repository, properties, AgentTelemetry.noop(256), new ObjectMapper());
            EvalResult result = EvalResult.builder()
                    .id("result-1")
                    .traceId("0123456789abcdef0123456789abcdef")
                    .verdict("PASS")
                    .score(0.92)
                    .scoreExportStatus(LangfuseScoreExportService.PENDING)
                    .build();

            service.schedule(result);

            assertThat(requests.await(3, TimeUnit.SECONDS)).isTrue();
            verify(repository, timeout(2_000)).updateScoreExport(
                    eq("result-1"), eq(LangfuseScoreExportService.SUCCESS), isNull(), anyLong());
            assertThat(bodies).anyMatch(body -> body.contains("business_assertion_pass"))
                    .anyMatch(body -> body.contains("answer_correctness"));
            assertThat(authorizations).allMatch(value -> value != null && value.startsWith("Basic "));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void skipsWhenTraceOrLangfuseConfigurationIsMissing() {
        AgentTelemetryProperties properties = new AgentTelemetryProperties();
        LangfuseScoreExportService service = new LangfuseScoreExportService(
                mock(EvalResultRepository.class), properties, AgentTelemetry.noop(256), new ObjectMapper());

        assertThat(service.initialStatus(null)).isEqualTo(LangfuseScoreExportService.SKIPPED);
        assertThat(service.initialStatus("0123456789abcdef0123456789abcdef"))
                .isEqualTo(LangfuseScoreExportService.SKIPPED);
    }

    private static AgentTelemetryProperties properties(int port) {
        AgentTelemetryProperties properties = new AgentTelemetryProperties();
        properties.setEnabled(true);
        properties.setExportTimeoutMs(1_000);
        properties.getLangfuse().setBaseUrl("http://127.0.0.1:" + port);
        properties.getLangfuse().setPublicKey("pk-test");
        properties.getLangfuse().setSecretKey("sk-test");
        return properties;
    }
}
