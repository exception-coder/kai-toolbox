package com.regentech_fashion.supplierquote.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class SrmMarketQuoteBackendTest {
    private HttpServer server;
    private final AtomicReference<String> listQuery = new AtomicReference<>();
    private final AtomicReference<String> submitBody = new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/list", exchange -> {
            listQuery.set(exchange.getRequestURI().getQuery());
            assertThat(exchange.getRequestHeaders().getFirst("secretkey")).isEqualTo("test-secret");
            respond(exchange, """
                    {"code":0,"data":{"list":[{"id":82031,"productId":1001,
                    "productCode":"YRN-40S","productName":"40S精梳棉","procolorCode":"C-090",
                    "procolorName":"藏青","procolorLevelsStr":"A级","haveTask":1}],"total":1}}
                    """);
        });
        server.createContext("/submit", exchange -> {
            submitBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, "{\"code\":0,\"data\":90001}");
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void scopesListAndSubmitToBoundSrmSupplier() {
        SupplierQuoteProperties properties = new SupplierQuoteProperties();
        properties.getMarketQuote().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        properties.getMarketQuote().setSecretKey("test-secret");
        properties.getMarketQuote().setListPath("/list");
        properties.getMarketQuote().setSubmitPath("/submit");
        SrmMarketQuoteBackend backend = new SrmMarketQuoteBackend(properties, new ObjectMapper());
        BindingView binding = new BindingView("42", "supplier", "供应商", "8658", "测试供应商", "SCM");

        var page = backend.findPage(binding, new MarketQuoteQuery(1, 20, "PENDING", "", ""));
        var result = backend.submit(binding, new MarketQuotePriceInput("82031", "21.00", "20.19"), "idem-1");

        assertThat(page.items()).singleElement().satisfies(item -> {
            assertThat(item.supcId()).isEqualTo("82031");
            assertThat(item.status()).isEqualTo("PENDING_QUOTE");
        });
        assertThat(listQuery.get()).contains("supId=8658", "supcIds=82031");
        assertThat(result.succeededIds()).containsExactly("82031");
        assertThat(submitBody.get()).contains("\"supcId\":82031", "\"priceIncludeTax\":21.00");
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
