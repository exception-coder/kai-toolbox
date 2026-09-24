package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProviderModelServiceTest {

    @Test
    void deepSeekCatalogUsesRootModelsWhileGenericGatewaysKeepV1() {
        assertEquals(URI.create("https://api.deepseek.com/models"),
                ProviderModelService.modelCatalogUri("https://api.deepseek.com/anthropic"));
        assertEquals(URI.create("https://api.deepseek.com/models"),
                ProviderModelService.modelCatalogUri("https://api.deepseek.com/v1"));
        assertEquals(URI.create("https://api.deepseek.com/models"),
                ProviderModelService.modelCatalogUri("http://api.deepseek.com/anthropic"));
        assertEquals(URI.create("https://gateway.example/v1/models"),
                ProviderModelService.modelCatalogUri("https://gateway.example"));
    }

    @Test
    void cachedCatalogNeverCrossesApiKeys() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/models", exchange -> {
            requests.incrementAndGet();
            String bearer = exchange.getRequestHeaders().getFirst("Authorization");
            boolean valid = "Bearer valid-key".equals(bearer);
            byte[] body = (valid ? "{\"data\":[{\"id\":\"model-a\"}]}"
                    : "{\"error\":{\"message\":\"Invalid token\"}}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(valid ? 200 : 401, body.length);
            try (var stream = exchange.getResponseBody()) {
                stream.write(body);
            }
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            ProviderModelService service = new ProviderModelService(new ObjectMapper());
            assertEquals("model-a", service.fetch(base, "valid-key").models().getFirst().value());
            assertTrue(service.fetch(base, "invalid-key").models().isEmpty());
            assertEquals(2, requests.get());
            assertEquals("model-a", service.fetch(base, "valid-key").models().getFirst().value());
            assertEquals(2, requests.get());
        } finally {
            server.stop(0);
        }
    }
}
