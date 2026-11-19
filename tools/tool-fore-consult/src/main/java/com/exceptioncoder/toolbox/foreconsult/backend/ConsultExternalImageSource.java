package com.exceptioncoder.toolbox.foreconsult.backend;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** The caller can select an opaque ID, never the network destination or service credentials. */
@Component
public class ConsultExternalImageSource {
    private final URI endpoint;
    private final String clientId;
    private final String token;

    public ConsultExternalImageSource(
            @Value("${toolbox.fore-consult.backend.image-source.endpoint:}") String endpoint,
            @Value("${toolbox.fore-consult.backend.image-source.client-id:}") String clientId,
            @Value("${toolbox.fore-consult.backend.image-source.token:}") String token) {
        this.clientId = clientId;
        this.token = token;
        this.endpoint = endpoint.isBlank() ? null : URI.create(endpoint);
        if (this.endpoint != null && (!"https".equals(this.endpoint.getScheme()) || this.endpoint.getHost() == null
                || this.endpoint.getRawUserInfo() != null || this.endpoint.getRawQuery() != null
                || this.endpoint.getRawFragment() != null || !endpoint.endsWith("/")
                || clientId.isBlank() || token.isBlank())) {
            throw new IllegalArgumentException("外部图片源须配置 HTTPS 目录、应用凭据 ID 与读取票据");
        }
    }

    public void requireAccess(ConsultBackendStore.Client client) {
        if (endpoint == null || !clientId.equals(client.id())) {
            throw new ConsultBackendException(403, "IMAGE_SOURCE_NOT_ALLOWED", "该应用未配置原图读取来源", false);
        }
    }

    public byte[] read(ConsultBackendStore.Client client, ConsultAnalysisInput.ImageRef ref, int remainingBytes) {
        requireAccess(client);
        if (ref.id() == null || !ref.id().matches("[A-Za-z0-9_-]{1,100}")) {
            throw ConsultBackendException.invalid("图片引用 ID 无效");
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) endpoint.resolve(ref.id()).toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Accept", ref.mediaType());
            if (connection.getResponseCode() != 200 || !ref.mediaType().equals(connection.getContentType())) {
                throw unavailable();
            }
            try (var body = connection.getInputStream()) {
                var bytes = new java.io.ByteArrayOutputStream();
                long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(15);
                byte[] buffer = new byte[8192];
                while (bytes.size() <= remainingBytes) {
                    if (System.nanoTime() >= deadline || Thread.currentThread().isInterrupted()) {
                        throw unavailable();
                    }
                    int count = body.read(buffer, 0, Math.min(buffer.length, remainingBytes + 1 - bytes.size()));
                    if (count < 0) { return bytes.toByteArray(); }
                    bytes.write(buffer, 0, count);
                }
                throw new ConsultBackendException(413, "IMAGES_TOO_LARGE", "原图超过单张或任务总量限制", false);
            }
        } catch (IOException error) {
            throw unavailable();
        } finally {
            if (connection != null) { connection.disconnect(); }
        }
    }

    private static ConsultBackendException unavailable() {
        return new ConsultBackendException(502, "IMAGE_SOURCE_UNAVAILABLE", "暂时无法从应用读取原图，请核对来源和图片有效期", true);
    }
}
