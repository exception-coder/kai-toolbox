package com.regentech_fashion.wyoooni.enterprise.infrastructure.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.wyoooni.enterprise.config.WyoooniEnterpriseProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WyoooniEnterpriseGatewayClientTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void acceptsAccountIdentityFromAnyCompanySourceSystem() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/verify", exchange -> {
            String response = """
                    {"authenticated":true,"accountId":"u-42","username":"buyer",
                     "displayName":"采购员","businessPartyId":"p-9","businessPartyName":"测试伙伴",
                     "sourceSystem":"SRM"}
                    """;
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();

        WyoooniEnterpriseProperties properties = new WyoooniEnterpriseProperties();
        properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.setAccountVerificationPath("/verify");
        WyoooniEnterpriseGatewayClient client = new WyoooniEnterpriseGatewayClient(
                properties, new ObjectMapper());

        var verified = client.verifyAccount("buyer", "secret");

        assertTrue(verified.isPresent());
        assertEquals("p-9", verified.orElseThrow().businessPartyId());
        assertEquals("SRM", verified.orElseThrow().sourceSystem());
    }
}
