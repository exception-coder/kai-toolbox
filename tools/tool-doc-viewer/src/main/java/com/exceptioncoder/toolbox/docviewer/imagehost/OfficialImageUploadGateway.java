package com.exceptioncoder.toolbox.docviewer.imagehost;

import com.aliyun.oss.ClientBuilderConfiguration;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.ObjectMetadata;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.Arrays;
import java.util.stream.Collectors;
import static com.exceptioncoder.toolbox.docviewer.imagehost.ImageHostModels.*;

@Component
public class OfficialImageUploadGateway implements ImageUploadGateway {
    private final ObjectMapper mapper;
    private final HttpClient github;

    @Autowired
    public OfficialImageUploadGateway(ObjectMapper mapper) {
        this(mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build());
    }
    OfficialImageUploadGateway(ObjectMapper mapper, HttpClient github) { this.mapper = mapper; this.github = github; }

    @Override
    public void upload(Stored p, String key, byte[] bytes, String type) throws Exception {
        switch (p.settings().provider()) {
            case "OSS" -> uploadOss(p, key, bytes, type);
            case "S3" -> uploadS3(p, key, bytes, type);
            case "GITHUB" -> uploadGithub(p, key, bytes);
            default -> throw new IllegalArgumentException("不支持的图床类型");
        }
    }

    private void uploadOss(Stored p, String key, byte[] bytes, String type) {
        var config = new ClientBuilderConfiguration();
        config.setConnectionTimeout(10_000); config.setSocketTimeout(30_000); config.setMaxErrorRetry(0);
        var client = new OSSClientBuilder().build(p.settings().endpoint(), p.credentials().accessKey(), p.credentials().secret(), config);
        try {
            var metadata = new ObjectMetadata();
            metadata.setContentType(type); metadata.setContentLength(bytes.length);
            metadata.setHeader("x-oss-forbid-overwrite", "true");
            client.putObject(p.settings().bucket(), key, new ByteArrayInputStream(bytes), metadata);
        } finally { client.shutdown(); }
    }

    private void uploadS3(Stored p, String key, byte[] bytes, String type) {
        try (var client = S3Client.builder().endpointOverride(URI.create(p.settings().endpoint()))
                .region(Region.of(p.settings().region()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(p.credentials().accessKey(), p.credentials().secret())))
                .forcePathStyle(p.settings().pathStyle())
                // R2 and other S3-compatible services require an ordinary bounded PUT, not aws-chunked trailers.
                .serviceConfiguration(S3Configuration.builder().chunkedEncodingEnabled(false).build())
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(10)).socketTimeout(Duration.ofSeconds(30)))
                .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofSeconds(45)).retryPolicy(RetryPolicy.none())).build()) {
            client.putObject(PutObjectRequest.builder().bucket(p.settings().bucket()).key(key).contentType(type)
                    .ifNoneMatch("*").build(), RequestBody.fromBytes(bytes));
        }
    }

    private void uploadGithub(Stored p, String key, byte[] bytes) throws Exception {
        String path = "https://api.github.com/repos/" + p.settings().repository() + "/contents/" + encodePath(key);
        String json = mapper.writeValueAsString(Map.of("message", "docs: upload markdown image", "branch", p.settings().branch(),
                "content", Base64.getEncoder().encodeToString(bytes)));
        var request = HttpRequest.newBuilder(URI.create(path)).timeout(Duration.ofSeconds(45))
                .header("Authorization", "Bearer " + p.credentials().secret()).header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28").header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(json)).build();
        var response = github.send(request, HttpResponse.BodyHandlers.discarding());
        if (response.statusCode() != 201) throw new IllegalStateException("图床返回非成功响应");
    }

    static String encodePath(String value) {
        return Arrays.stream(value.split("/", -1)).map(v -> URLEncoder.encode(v, StandardCharsets.UTF_8).replace("+", "%20"))
                .collect(Collectors.joining("/"));
    }
}
