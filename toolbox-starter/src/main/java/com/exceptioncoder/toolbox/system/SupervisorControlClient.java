package com.exceptioncoder.toolbox.system;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.regex.Pattern;

import static com.exceptioncoder.toolbox.system.RestartCoordinator.Failure;
import static com.exceptioncoder.toolbox.system.RestartCoordinator.RestartOutcome;

/** 严格校验本机 supervisor 身份/能力后，请求全栈 reload。 */
@Component
public class SupervisorControlClient {

    private static final Logger log = LoggerFactory.getLogger(SupervisorControlClient.class);
    private static final String CONTROL_TOKEN_ENV = "KAI_SUPERVISOR_CONTROL_TOKEN";
    private static final Pattern URL_USER_INFO = Pattern.compile("(?i)(https?://)[^\\s/@]+@");
    private static final Pattern SENSITIVE_QUERY = Pattern.compile(
            "(?i)([?&](?:access[_-]?token|token|api[_-]?key|secret|password|credential|auth)=)[^&#\\s]+");
    private static final Pattern LABELED_SECRET = Pattern.compile(
            "(?i)(authorization|x-restart-token|token|password|secret)\\s*[:=]\\s*[^,;\\s]+");

    private final SystemProperties systemProperties;
    private final RestartProperties restartProperties;
    private final RestartRuntime runtime;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public SupervisorControlClient(SystemProperties systemProperties,
                                   RestartProperties restartProperties,
                                   RestartRuntime runtime,
                                   ObjectMapper objectMapper) {
        this(systemProperties, restartProperties, runtime, objectMapper,
                HttpClient.newBuilder()
                        .connectTimeout(restartProperties.getSupervisorConnectTimeout())
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .version(HttpClient.Version.HTTP_1_1)
                        .build());
    }

    SupervisorControlClient(SystemProperties systemProperties,
                            RestartProperties restartProperties,
                            RestartRuntime runtime,
                            ObjectMapper objectMapper,
                            HttpClient httpClient) {
        this.systemProperties = systemProperties;
        this.restartProperties = restartProperties;
        this.runtime = runtime;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    RestartOutcome preflight(Path expectedRepoRoot) {
        Path repoRoot = existingDirectory(expectedRepoRoot);
        if (repoRoot == null) {
            return RestartOutcome.rejected(Failure.INVALID_REPOSITORY, "supervisor 仓库目录不存在");
        }
        String token = runtime.environment(CONTROL_TOKEN_ENV);
        if (token == null || token.isBlank()) {
            return RestartOutcome.rejected(Failure.SUPERVISOR_TOKEN_UNAVAILABLE,
                    "当前进程缺少 supervisor 内部控制令牌，拒绝退出");
        }

        HttpRequest request = HttpRequest.newBuilder(uri("/status"))
                .timeout(restartProperties.getSupervisorRequestTimeout())
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return RestartOutcome.rejected(Failure.SUPERVISOR_UNAVAILABLE,
                        "supervisor status 返回 HTTP " + response.statusCode());
            }
            JsonNode status = objectMapper.readTree(response.body());
            int actualProtocol = status.path("protocolVersion").asInt(-1);
            if (actualProtocol != restartProperties.getSupervisorProtocolVersion()) {
                return RestartOutcome.rejected(Failure.SUPERVISOR_INCOMPATIBLE,
                        "supervisor 控制协议不兼容（期望 "
                                + restartProperties.getSupervisorProtocolVersion() + "，实际 " + actualProtocol + "）");
            }
            if (!status.path("bootstrapAttached").asBoolean(false)) {
                return RestartOutcome.rejected(Failure.SUPERVISOR_INCOMPATIBLE,
                        "supervisor 缺少稳定 bootstrap 接管，拒绝让当前 JVM 退出");
            }
            if (!status.path("capabilities").path("fullReload").asBoolean(false)) {
                return RestartOutcome.rejected(Failure.SUPERVISOR_INCOMPATIBLE,
                        "supervisor 不支持 fullReload，拒绝让当前 JVM 退出");
            }
            String reportedRepo = status.path("repoRoot").asText("");
            if (reportedRepo.isBlank() || !samePath(repoRoot, Path.of(reportedRepo))) {
                return RestartOutcome.rejected(Failure.SUPERVISOR_INCOMPATIBLE,
                        "supervisor 管理的仓库与当前更新仓库不一致");
            }
            return RestartOutcome.accepted("supervisor full-reload 交接预检通过");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return RestartOutcome.rejected(Failure.SUPERVISOR_UNAVAILABLE, "检查 supervisor 时线程被中断");
        } catch (Exception e) {
            log.warn("[restart] supervisor status 校验失败：{}", safeError(e));
            return RestartOutcome.rejected(Failure.SUPERVISOR_UNAVAILABLE,
                    "无法验证 supervisor full-reload 能力，当前服务继续运行");
        }
    }

    RestartOutcome requestFullReload(Path expectedRepoRoot) {
        RestartOutcome preflight = preflight(expectedRepoRoot);
        if (!preflight.accepted()) return preflight;

        String token = runtime.environment(CONTROL_TOKEN_ENV);
        HttpRequest request = HttpRequest.newBuilder(uri("/full-reload"))
                .timeout(restartProperties.getSupervisorRequestTimeout())
                .header("X-Restart-Token", token)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return RestartOutcome.rejected(Failure.SUPERVISOR_UNAVAILABLE,
                        "supervisor 拒绝 full-reload（HTTP " + response.statusCode() + "）");
            }
            return RestartOutcome.accepted("supervisor 已接受 full-reload，全栈即将重载");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return RestartOutcome.rejected(Failure.SUPERVISOR_UNAVAILABLE,
                    "请求 supervisor full-reload 时线程被中断");
        } catch (Exception e) {
            log.warn("[restart] supervisor full-reload 请求失败：{}", safeError(e));
            return RestartOutcome.rejected(Failure.SUPERVISOR_UNAVAILABLE,
                    "supervisor 未确认 full-reload，当前服务继续运行");
        }
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + systemProperties.getSupervisorPort() + path);
    }

    private static Path existingDirectory(Path path) {
        if (path == null) return null;
        try {
            Path real = path.toRealPath();
            return Files.isDirectory(real) ? real : null;
        } catch (IOException e) {
            return null;
        }
    }

    static boolean samePath(Path left, Path right) {
        try {
            return Files.isSameFile(left, right);
        } catch (IOException | RuntimeException ignored) {
            String a = left.toAbsolutePath().normalize().toString();
            String b = right.toAbsolutePath().normalize().toString();
            boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
            return windows ? a.equalsIgnoreCase(b) : a.equals(b);
        }
    }

    static String safeError(Exception e) {
        String message = e.getMessage();
        if (message == null || message.isBlank()) return e.getClass().getSimpleName();
        String sanitized = message.replace('\r', ' ').replace('\n', ' ');
        sanitized = URL_USER_INFO.matcher(sanitized).replaceAll("$1<redacted>@");
        sanitized = SENSITIVE_QUERY.matcher(sanitized).replaceAll("$1<redacted>");
        sanitized = LABELED_SECRET.matcher(sanitized).replaceAll("$1=<redacted>");
        if (sanitized.length() > 400) sanitized = sanitized.substring(0, 400) + "…";
        return e.getClass().getSimpleName() + ": " + sanitized;
    }
}
