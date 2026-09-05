package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.autoconfigure.ForgeSessionRelayProperties;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

/** 隔离所有 Forge REST 凭据和上游地址的基础设施适配器。 */
public final class ForgeRelayUpstreamClient {
    private static final String UPSTREAM_PATH = "/api/session-client/v1";
    private final ForgeSessionRelayProperties properties;
    private final RestClient restClient;

    public ForgeRelayUpstreamClient(ForgeSessionRelayProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        this.restClient = builder.baseUrl(trimSlash(properties.getForgeBaseUrl())).build();
    }

    public ForgeRelayBinding exchange(long subjectUserId, String invitationCode) {
        JsonNode response = restClient.post().uri(UPSTREAM_PATH + "/relay/invitations/exchange")
                .header(HttpHeaders.AUTHORIZATION, basicCredentials())
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ExchangeRequest(subjectUserId, invitationCode))
                .retrieve().body(JsonNode.class);
        if (response == null) {
            throw new IllegalStateException("Forge Relay 配对未返回结果");
        }
        return new ForgeRelayBinding(subjectUserId, response.path("accessToken").asText(),
                Instant.parse(response.path("expiresAt").asText()), response.path("grantId").asText(),
                response.path("sessionId").asText());
    }

    public ResponseEntity<byte[]> get(ForgeRelayBinding binding, String relativePath) {
        return restClient.get().uri(UPSTREAM_PATH + relativePath)
                .header(HttpHeaders.AUTHORIZATION, bearer(binding)).retrieve().toEntity(byte[].class);
    }

    public ResponseEntity<byte[]> upload(ForgeRelayBinding binding, MultipartFile file) throws IOException {
        LinkedMultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResource(file.getBytes()) {
            @Override public String getFilename() { return file.getOriginalFilename(); }
        });
        return restClient.post().uri(UPSTREAM_PATH + "/attachments")
                .header(HttpHeaders.AUTHORIZATION, bearer(binding))
                .contentType(MediaType.MULTIPART_FORM_DATA).body(body).retrieve().toEntity(byte[].class);
    }

    public URI createWebSocketUri(ForgeRelayBinding binding) {
        JsonNode response = restClient.post().uri(UPSTREAM_PATH + "/connections")
                .header(HttpHeaders.AUTHORIZATION, bearer(binding)).retrieve().body(JsonNode.class);
        if (response == null || response.path("ticket").asText().isBlank()) {
            throw new IllegalStateException("Forge 未返回连接 ticket");
        }
        String base = trimSlash(properties.getForgeBaseUrl());
        String websocketBase = base.startsWith("https://") ? "wss://" + base.substring(8)
                : base.startsWith("http://") ? "ws://" + base.substring(7) : base;
        return URI.create(websocketBase + UPSTREAM_PATH + "/ws?ticket="
                + response.path("ticket").asText() + "&protocolVersion=1.0");
    }

    private String basicCredentials() {
        String raw = properties.getClientId() + ":" + properties.getClientSecret();
        return "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private static String bearer(ForgeRelayBinding binding) {
        return "Bearer " + binding.accessToken();
    }

    private static String trimSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private record ExchangeRequest(long subjectUserId, String invitationCode) { }
}
