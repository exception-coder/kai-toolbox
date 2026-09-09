package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.autoconfigure.ForgeSessionRelayProperties;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class CapsuleUpstreamTest {
    @Test
    void usesServerCredentialsWithoutInvitationAndRejectsArbitraryPaths() {
        var properties = new ForgeSessionRelayProperties();
        properties.setCapsuleMode(true);
        properties.setForgeBaseUrl("https://forge.test");
        properties.setClientId("one");
        properties.setClientSecret("test-only");
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new ForgeRelayUpstreamClient(properties, builder);
        var binding = new ForgeRelayBinding(12, "", Instant.MAX, "", "");
        var uri = client.createWebSocketUri(binding);
        assertThat(uri.toString()).isEqualTo("wss://forge.test/api/session-client/v1/relay/capsule/ws");
        var headers = client.webSocketHeaders(binding, uri);
        assertThat(headers.getOrigin()).isEqualTo("https://forge.test");
        assertThat(headers.getFirst("X-Forge-Participant-Id")).isEqualTo("12");
        server.expect(requestTo("https://forge.test/api/session-client/v1/relay/capsule/api/assistant/feedback-sessions"))
                .andExpect(header("Authorization", headers.getFirst("Authorization")))
                .andExpect(header("X-Forge-Participant-Id", "12"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThat(client.capsuleApi(12, "/api/assistant/feedback-sessions", "GET", null, null).getStatusCode().value()).isEqualTo(200);
        for (String path : new String[] {"/api/auth/users", "/api/assistant/../auth/users", "/api/assistant/%2e%2e/auth/users"}) {
            assertThatThrownBy(() -> client.capsuleApi(12, path, "GET", null, null)).isInstanceOf(IllegalArgumentException.class);
        }
        server.verify();
    }
}
