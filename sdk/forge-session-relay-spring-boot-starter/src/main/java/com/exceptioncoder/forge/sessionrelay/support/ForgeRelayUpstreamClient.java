package com.exceptioncoder.forge.sessionrelay.support;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.autoconfigure.ForgeSessionRelayProperties;
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
        boolean invitationBound = properties.isInvitationBoundIdentity();
        String endpoint = invitationBound ? "/relay/invitations/pair" : "/relay/invitations/exchange";
        Object request = invitationBound ? new PairRequest(subjectUserId, invitationCode)
                : new ExchangeRequest(subjectUserId, invitationCode);
        ExchangeResponse response = restClient.post().uri(UPSTREAM_PATH + endpoint)
                .header(HttpHeaders.AUTHORIZATION, basicCredentials())
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve().body(ExchangeResponse.class);
        if (response == null) {
            throw new IllegalStateException("Forge Relay 配对未返回结果");
        }
        return new ForgeRelayBinding(subjectUserId, response.accessToken(),
                Instant.parse(response.expiresAt()), response.grantId(), response.sessionId());
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
        ConnectionResponse response = restClient.post().uri(UPSTREAM_PATH + "/connections")
                .header(HttpHeaders.AUTHORIZATION, bearer(binding)).retrieve().body(ConnectionResponse.class);
        if (response == null || response.ticket() == null || response.ticket().isBlank()) {
            throw new IllegalStateException("Forge 未返回连接 ticket");
        }
        String base = trimSlash(properties.getForgeBaseUrl());
        String websocketBase = base.startsWith("https://") ? "wss://" + base.substring(8)
                : base.startsWith("http://") ? "ws://" + base.substring(7) : base;
        return URI.create(websocketBase + UPSTREAM_PATH + "/ws?ticket="
                + response.ticket() + "&protocolVersion=1.0");
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
    private record PairRequest(long participantId, String invitationCode) { }

    /** 使用普通协议数据避免宿主 Jackson 主版本与树模型耦合。 */
    private record ExchangeResponse(String accessToken, String expiresAt, String grantId, String sessionId) { }

    /** 上游一次性连接凭据。 */
    private record ConnectionResponse(String ticket) { }
}
