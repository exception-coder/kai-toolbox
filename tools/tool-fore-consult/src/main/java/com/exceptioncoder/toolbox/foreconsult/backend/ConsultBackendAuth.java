package com.exceptioncoder.toolbox.foreconsult.backend;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Separate application authority: never mints a platform user or accepts a caller-selected owner. */
@Service
public class ConsultBackendAuth {
    private final ConsultBackendStore store;
    private final ProjectCatalog projects;
    private final ProjectAccess access;
    private final ObjectMapper mapper;
    private final boolean enabled;
    private final boolean authEnabled;
    private final SecureRandom random = new SecureRandom();
    private long tokenWindow;
    private int tokenAttempts;
    private final java.util.Map<String, long[]> requestWindows = new java.util.HashMap<>();

    public ConsultBackendAuth(ConsultBackendStore store, ProjectCatalog projects, ProjectAccess access, ObjectMapper mapper,
            @Value("${toolbox.fore-consult.backend.enabled:false}") boolean enabled,
            @Value("${toolbox.auth.enabled:false}") boolean authEnabled) {
        this.store = store; this.projects = projects; this.access = access; this.mapper = mapper;
        this.enabled = enabled; this.authEnabled = authEnabled;
    }

    public void requireEnabled() {
        if (!enabled || !authEnabled) throw new ConsultBackendException(503, "INTEGRATION_DISABLED", "业务咨询后端接入尚未启用", true);
    }

    private String administrator() {
        if (!authEnabled) throw new ConsultBackendException(503, "INTEGRATION_DISABLED", "应用授权管理要求开启平台认证", false);
        return AuthContext.current().filter(p -> p.hasAnyRole("ADMIN"))
                .map(p -> String.valueOf(p.userId())).orElseThrow(() -> new ConsultBackendException(403, "ADMIN_REQUIRED", "仅管理员可管理应用凭据", false));
    }

    public record GrantRequest(String appId, String tenantId, List<String> projectIds, long expiresAt) {}
    public record Credential(String clientId, String clientSecret, String appId, String tenantId, long expiresAt, long version) {
        @Override public String toString() { return "Credential[redacted]"; }
    }
    public record AccessToken(String access_token, String token_type, long expires_in, String scope) {
        @Override public String toString() { return "AccessToken[redacted]"; }
    }

    public record ClientView(String clientId, String appId, String tenantId, List<String> projectIds,
                             long version, String status, long expiresAt, String changedBy, long changedAt) {}
    public record ProjectOption(String id, String name) {}
    public record ManagementView(boolean enabled, List<ClientView> clients, List<ProjectOption> projects, boolean truncated) {}

    public ManagementView management(String query) {
        administrator();
        String search = query == null ? "" : query.trim();
        if (search.length() > 100) throw ConsultBackendException.invalid("搜索内容最多 100 字符");
        var rows = store.clients(search);
        long now = System.currentTimeMillis();
        var clients = rows.stream().limit(200).map(c -> new ClientView(c.id(), c.appId(), c.tenantId(),
                readProjectIds(c.projects()), c.version(), !c.enabled() ? "REVOKED" : c.expiresAt() <= now ? "EXPIRED" : "ACTIVE",
                c.expiresAt(), c.changedBy(), c.changedAt())).toList();
        var options = projects.list(false).stream().filter(p -> p.available() && !p.excluded() && access.allowed(Path.of(p.path())))
                .map(p -> new ProjectOption(p.id(), p.name())).toList();
        return new ManagementView(enabled, clients, options, rows.size() > 200);
    }

    public synchronized Credential create(GrantRequest request) {
        return create(request, null);
    }

    /** Optional intent key protects browser retries without restricting existing multi-grant callers. */
    public synchronized Credential create(GrantRequest request, String intentKey) {
        String actor = administrator();
        if (request == null) throw ConsultBackendException.invalid("缺少授权内容");
        identifier(request.appId(), "appId"); identifier(request.tenantId(), "tenantId");
        validateExpiry(request.expiresAt());
        if (request.projectIds() != null && request.projectIds().stream().anyMatch(java.util.Objects::isNull)) throw ConsultBackendException.invalid("项目列表不得含空项");
        var ids = request.projectIds() == null ? List.<String>of() : List.copyOf(request.projectIds());
        if (ids.size() > 8 || ids.stream().distinct().count() != ids.size()) throw ConsultBackendException.invalid("最多授权 8 个不重复项目");
        validateProjects(ids);
        if (intentKey != null && !intentKey.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))
            throw ConsultBackendException.invalid("Idempotency-Key 必须为 UUID");
        String clientId = "fca_" + (intentKey == null ? UUID.randomUUID()
                : UUID.nameUUIDFromBytes((actor + ":" + intentKey.toLowerCase(java.util.Locale.ROOT)).getBytes(StandardCharsets.UTF_8)))
                .toString().replace("-", "");
        if (store.client(clientId).isPresent())
            throw new ConsultBackendException(409, "CREDENTIAL_ALREADY_ISSUED", "本次颁发已完成，密钥不能再次读取。请刷新列表核对应用，遗失密钥请显式轮换", false);
        try {
            String secret = randomValue();
            var client = new ConsultBackendStore.Client(clientId, request.appId(), request.tenantId(),
                    hash(secret), mapper.writeValueAsString(ids), 1, true, request.expiresAt());
            store.insertClient(client, actor);
            return credential(client, secret, 1);
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new IllegalStateException("无法保存应用授权", error); }
    }

    public Credential rotate(String id) { return rotate(id, null); }

    public Credential rotate(String id, Long expiresAt) {
        String actor = administrator();
        var client = store.client(id).filter(ConsultBackendStore.Client::enabled).orElseThrow(ConsultBackendAuth::unauthorized);
        long until = expiresAt == null ? client.expiresAt() : expiresAt;
        validateExpiry(until);
        String secret = randomValue();
        if (!store.rotate(id, hash(secret), client.version(), until, actor)) throw new ConsultBackendException(409, "CREDENTIAL_CHANGED", "凭据已变更，请重新核对", false);
        return new Credential(client.id(), secret, client.appId(), client.tenantId(), until, client.version() + 1);
    }

    public void revoke(String id) { String actor = administrator(); store.revoke(id, actor); }

    private Credential credential(ConsultBackendStore.Client c, String secret, long version) {
        return new Credential(c.id(), secret, c.appId(), c.tenantId(), c.expiresAt(), version);
    }

    public synchronized AccessToken token(String basic, String grantType) {
        requireEnabled();
        long now = System.currentTimeMillis();
        if (now - tokenWindow >= 60000) { tokenWindow = now; tokenAttempts = 0; }
        if (++tokenAttempts > 120) throw new ConsultBackendException(429, "RATE_LIMITED", "认证请求过多，请稍后重试", true);
        if (!"client_credentials".equals(grantType)) throw ConsultBackendException.invalid("grant_type 必须为 client_credentials");
        try {
            if (basic == null || !basic.startsWith("Basic ") || basic.length() > 512) throw unauthorized();
            String decoded = new String(Base64.getDecoder().decode(basic.substring(6)), StandardCharsets.UTF_8);
            int colon = decoded.indexOf(':');
            if (colon < 1) throw unauthorized();
            var c = active(decoded.substring(0, colon));
            String secret = decoded.substring(colon + 1);
            if (!MessageDigest.isEqual(hash(secret).getBytes(StandardCharsets.US_ASCII), c.secretHash().getBytes(StandardCharsets.US_ASCII))) throw unauthorized();
            String token = "fct_" + randomValue();
            long until = Math.min(now + 900000, c.expiresAt());
            store.token(hash(token), c, until);
            return new AccessToken(token, "Bearer", Math.max(0, (until - now) / 1000), "consult:analyze consult:read consult:cancel");
        } catch (IllegalArgumentException malformed) { throw unauthorized(); }
    }

    public synchronized ConsultBackendStore.Client authenticate(String bearer) {
        requireEnabled();
        if (bearer == null || !bearer.matches("Bearer fct_[A-Za-z0-9_-]{43}")) throw unauthorized();
        var client = store.tokenClient(hash(bearer.substring(7))).orElseThrow(ConsultBackendAuth::unauthorized);
        long now = System.currentTimeMillis();
        requestWindows.entrySet().removeIf(e -> now - e.getValue()[0] >= 60000);
        if (!requestWindows.containsKey(client.id()) && requestWindows.size() >= 1024)
            throw new ConsultBackendException(429, "RATE_LIMITED", "请求繁忙，请稍后重试", true);
        var window = requestWindows.computeIfAbsent(client.id(), key -> new long[] {now, 0});
        if (++window[1] > 120) throw new ConsultBackendException(429, "RATE_LIMITED", "当前应用请求过多，请降低查询频率", true);
        return client;
    }

    public ConsultBackendStore.Client active(String id) {
        return store.client(id).filter(c -> c.enabled() && c.expiresAt() > System.currentTimeMillis()).orElseThrow(ConsultBackendAuth::unauthorized);
    }

    public List<String> projectIds(ConsultBackendStore.Client client) {
        return readProjectIds(client.projects());
    }

    private List<String> readProjectIds(String projects) {
        try { return mapper.readValue(projects, new TypeReference<List<String>>() {}); }
        catch (Exception error) { throw new IllegalStateException("应用项目授权损坏", error); }
    }

    public void validateProjects(List<String> ids) {
        var catalog = projects.list(false);
        for (String id : ids) {
            identifier(id, "projectId");
            if (catalog.stream().noneMatch(p -> p.id().equals(id) && p.available() && !p.excluded() && access.allowed(Path.of(p.path()))))
                throw new ConsultBackendException(403, "PROJECT_NOT_ALLOWED", "项目未授权或当前不可用", false);
        }
    }

    static void identifier(String value, String name) {
        if (value == null || !value.matches("[A-Za-z0-9_.:-]{1,100}")) throw ConsultBackendException.invalid(name + " 格式无效");
    }

    private static void validateExpiry(long expiresAt) {
        if (expiresAt <= System.currentTimeMillis() || expiresAt > System.currentTimeMillis() + 366L * 86400000)
            throw ConsultBackendException.invalid("凭据有效期须在未来一年以内");
    }

    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    private String randomValue() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    private static ConsultBackendException unauthorized() { return new ConsultBackendException(401, "INVALID_CLIENT_TOKEN", "应用凭据或票据无效、已过期或已撤销", false); }
}
