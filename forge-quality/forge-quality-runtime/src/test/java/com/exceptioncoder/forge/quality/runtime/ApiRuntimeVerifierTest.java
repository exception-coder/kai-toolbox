package com.exceptioncoder.forge.quality.runtime;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiRuntimeVerifierTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void callsApiAndChecksRequiredJsonPath() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/quote", exchange -> {
            byte[] response = "{\"data\":{\"id\":10001}}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        RuntimeScenario scenario = new RuntimeScenario("quote-api", "api", Map.of(
                "url", "http://127.0.0.1:" + server.getAddress().getPort() + "/quote",
                "expectStatus", 200,
                "requiredJsonPaths", List.of("data.id")
        ));

        RuntimeVerificationResult result = new ApiRuntimeVerifier().verify(scenario);

        assertEquals(RuntimeStatus.PASSED, result.status());
        assertEquals("status=200", result.evidence());
    }

    @Test
    void reportsUnexpectedServerError() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/quote", exchange -> {
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        server.start();
        RuntimeScenario scenario = new RuntimeScenario("quote-api", "api", Map.of(
                "url", "http://127.0.0.1:" + server.getAddress().getPort() + "/quote",
                "expectStatus", 200
        ));

        RuntimeVerificationResult result = new ApiRuntimeVerifier().verify(scenario);

        assertEquals(RuntimeStatus.FAILED, result.status());
        assertEquals("expected=200, actual=500", result.evidence());
    }
}
