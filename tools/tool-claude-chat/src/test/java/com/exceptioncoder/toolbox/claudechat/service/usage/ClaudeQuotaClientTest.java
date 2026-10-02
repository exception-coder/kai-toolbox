package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SuppressWarnings("unchecked")
class ClaudeQuotaClientTest {
    private final HttpClient http = mock(HttpClient.class);
    private final HttpResponse<String> response = mock(HttpResponse.class);
    private final AtomicReference<String> credentials = new AtomicReference<>(credential("test-account-a"));
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final ClaudeQuotaClient client = new ClaudeQuotaClient(
            new ObjectMapper(), http, Path.of("nonexistent-test-config"), credentials::get, clock::get);

    private static String credential(String token) {
        return "{\"claudeAiOauth\":{\"accessToken\":\"" + token + "\",\"subscriptionType\":\"pro\"}}";
    }

    private void respond(String body) throws Exception {
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    @Test void successfulCacheRetainsActualCaptureTimeAndAccountSwitchRefetches() throws Exception {
        respond("{\"five_hour\":{\"utilization\":25},\"seven_day\":{\"utilization\":70}}");
        var first = client.get();
        assertNotNull(first);
        clock.addAndGet(1000);
        assertEquals(first.capturedAt(), client.get().capturedAt());
        verify(http, times(1)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        credentials.set(credential("test-account-b"));
        when(response.body()).thenReturn("{\"five_hour\":{\"utilization\":80}}");
        assertEquals(80, client.get().primaryUsedPercent());
        verify(http, times(2)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        credentials.set(null);
        assertNull(client.get());
    }

    @Test void accountChangeDuringReadRejectsSnapshot() throws Exception {
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
            credentials.set(credential("test-account-b"));
            return response;
        });
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"five_hour\":{\"utilization\":25}}");
        assertNull(client.get());
    }

    @Test void invalidPercentageAndRateLimitNeverBecomeBalance() throws Exception {
        respond("{\"five_hour\":{\"utilization\":101},\"seven_day\":{\"utilization\":-1}}");
        assertNull(client.get());
        when(response.statusCode()).thenReturn(429);
        clock.addAndGet(400_000);
        assertNull(client.get());
        client.get();
        verify(http, times(2)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }
}
