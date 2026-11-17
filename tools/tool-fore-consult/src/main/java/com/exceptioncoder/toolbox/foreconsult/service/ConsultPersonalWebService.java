package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.common.resource.WebResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** 本人通过独立表单授权，凭据仅驻留内存；模型只能使用不可跨咨询复用的引用。 */
@Service
public class ConsultPersonalWebService {
    private static final long TTL = TimeUnit.MINUTES.toMillis(15);
    private final ConsultSessionRepository sessions;
    private final ConsultSourceRoutingService routing;
    private final WebResourceGateway gateway;
    private final java.util.function.LongSupplier now;
    private final Map<String, Grant> grants = new HashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public ConsultPersonalWebService(ConsultSessionRepository sessions, ConsultSourceRoutingService routing, WebResourceGateway gateway) {
        this(sessions, routing, gateway, System::currentTimeMillis);
    }
    ConsultPersonalWebService(ConsultSessionRepository sessions, ConsultSourceRoutingService routing, WebResourceGateway gateway, java.util.function.LongSupplier now) {
        this.sessions = sessions; this.routing = routing; this.gateway = gateway; this.now = now;
    }

    public record Credentials(String siteUrl, String environment, String username,
                              @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) String password,
                              String loginPage) {
        @Override public String toString() { return "PersonalWebCredentials[redacted]"; }
    }
    public record State(boolean configured, String siteUrl, String environment, long expiresAt, Object result) { }
    private record Grant(String id, String owner, String sourcePath, BrowserLoginTarget account, String loginPage, long expiresAt) {
        String key() { return "personal:" + id; }
        @Override public String toString() { return "PersonalWebGrant[redacted]"; }
    }

    public synchronized State status(String consultId) {
        var session = owner(consultId);
        var grant = current(session);
        return grant == null ? new State(false, null, null, 0, null) : state(grant, null);
    }

    public synchronized State login(String consultId, Credentials input) {
        var session = owner(consultId);
        var scope = routing.current(session);
        if (scope != null && scope.focusedProject() == null) { throw new IllegalArgumentException("请先确认本次咨询所属系统"); }
        if (input == null || !List.of("LOCAL", "DEV", "TEST", "UAT").contains(input.environment() == null ? "" : input.environment())
                || !bounded(input.username(), 200) || !bounded(input.password(), 1000) || !bounded(input.siteUrl(), 2048)) {
            throw new IllegalArgumentException("请填写站点、明确的测试环境及个人账号密码");
        }
        if (input.loginPage() != null && input.loginPage().length() > 512) { throw new IllegalArgumentException("登录页路径过长"); }
        URI uri;
        try { uri = URI.create(input.siteUrl().trim()); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("请输入完整的HTTP(S)应用地址"); }
        if (uri.getHost() == null || !List.of("https", "http").contains(uri.getScheme()) || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("应用地址不能包含账号、查询参数或片段，请另填登录页路径");
        }
        revoke(consultId);
        if (grants.size() >= 32) { throw new IllegalArgumentException("临时登录会话已满，请稍后重试"); }
        String id = "personal-" + UUID.randomUUID();
        var account = new BrowserLoginTarget(id, "个人临时账号", input.environment(), uri.toString(), input.username(), input.password(), "username", "password");
        var grant = new Grant(id, session.getUserId(), session.getSystemSourcePath(), account, input.loginPage(), now.getAsLong() + TTL);
        try {
            Object result = gateway.readPersonal(grant.key(), grant.sourcePath(), account,
                    new WebResourceGateway.Request(id, null, account.environment(), grant.loginPage()));
            grants.put(consultId, grant);
            CompletableFuture.delayedExecutor(15, TimeUnit.MINUTES).execute(() -> expire(consultId, id));
            return state(grant, result);
        } catch (RuntimeException failure) {
            gateway.closePersonal(grant.key());
            throw new IllegalArgumentException("个人登录未完成，请核对系统、地址、环境及登录页；内网或非标准端口站点须先登记地址，不支持生产、验证码或跨域SSO");
        }
    }

    public synchronized void logout(String consultId) { owner(consultId); revoke(consultId); }

    public synchronized List<ReadonlyResourceGateway.Entry> discover(ConsultSession session) {
        var grant = current(session);
        return grant == null ? List.of() : List.of(new ReadonlyResourceGateway.Entry(grant.id(), "personal", "本次咨询", "本人临时账号",
                grant.account().environment(), "本人声明环境（未独立核验），仅当前咨询15分钟", "AVAILABLE", null, grant.account().baseUrl(), "APP"));
    }

    public synchronized Object read(ConsultSession session, WebResourceGateway.Request request) {
        var grant = current(session);
        if (grant == null || !grant.id().equals(request.bindingId())) {
            throw new IllegalArgumentException("个人账号授权已过期或不属于本次咨询，请在个人账号入口重新登录");
        }
        if (request.environment() != null && !request.environment().equals(grant.account().environment())) {
            throw new IllegalArgumentException("个人账号环境不匹配");
        }
        return gateway.readPersonal(grant.key(), grant.sourcePath(), grant.account(), new WebResourceGateway.Request(
                grant.id(), request.url(), grant.account().environment(), grant.loginPage()));
    }

    private Grant current(ConsultSession session) {
        var grant = grants.get(session.getSessionId());
        if (grant != null && (grant.expiresAt() <= now.getAsLong() || !"PENDING".equals(session.getArchiveStatus())
                || !grant.owner().equals(session.getUserId()) || !grant.sourcePath().equals(session.getSystemSourcePath()))) {
            revoke(session.getSessionId()); return null;
        }
        return grant;
    }
    private ConsultSession owner(String id) {
        var principal = AuthContext.current().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        var session = sessions.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!String.valueOf(principal.userId()).equals(session.getUserId())) { throw new ResponseStatusException(HttpStatus.NOT_FOUND); }
        if (!"PENDING".equals(session.getArchiveStatus())) { throw new IllegalArgumentException("咨询已归档，不能使用个人账号"); }
        return session;
    }
    private State state(Grant grant, Object result) { return new State(true, grant.account().baseUrl(), grant.account().environment(), grant.expiresAt(), result); }
    private boolean bounded(String value, int max) { return value != null && !value.isBlank() && value.length() <= max; }
    private synchronized void expire(String id, String expected) {
        var current = grants.get(id);
        if (current != null && current.id().equals(expected)) { revoke(id); }
    }
    private void revoke(String id) { var previous = grants.remove(id); if (previous != null) { gateway.closePersonal(previous.key()); } }
    @jakarta.annotation.PreDestroy
    public synchronized void shutdown() { List.copyOf(grants.keySet()).forEach(this::revoke); }
}
