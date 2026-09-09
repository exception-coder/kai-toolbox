package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.autoconfigure.ForgeSessionRelayProperties;
import java.time.Instant;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ForgeRelayResponseHeadersTest {
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void forwardsPayloadWithoutUpstreamFramingOrCredentials(boolean upload) throws Exception {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var properties = new ForgeSessionRelayProperties();
        properties.setForgeBaseUrl("http://forge.test");
        var client = new ForgeRelayUpstreamClient(properties, builder);
        var binding = new ForgeRelayBinding(1, "test-token", Instant.MAX, "grant", "session");
        server.expect(requestTo("http://forge.test/api/session-client/v1/" + (upload ? "attachments" : "session")))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON)
                        .header("Transfer-Encoding", "chunked")
                        .header("Connection", "keep-alive, X-Private")
                        .header("X-Private", "private-value")
                        .header("Set-Cookie", "upstream=test")
                        .header("Content-Length", "999"));
        var response = upload
                ? client.upload(binding, new MockMultipartFile("file", "test.txt", "text/plain", new byte[] {1}))
                : client.get(binding, "/session");
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isEqualTo(new byte[] {'{', '}'});
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getHeaders().headerSet()).hasSize(2);
        server.verify();
    }
}
