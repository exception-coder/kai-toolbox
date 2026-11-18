package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.common.resource.WebResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultPersonalWebRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultPersonalWebRepository.Account;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/** 本人账号按用户和系统持久保存；模型只能使用当前所有者范围内的引用。 */
@Service
public class ConsultPersonalWebService {
    private final ConsultSessionRepository sessions;
    private final WebResourceGateway gateway;
    private final ConsultPersonalWebRepository accounts;
    private final ObjectMapper mapper;
    private final java.util.function.LongSupplier now;
    // 有界条带锁，不在状态读取或其他用户请求上持有全局浏览器锁。
    private final ReentrantLock[] locks = java.util.stream.IntStream.range(0, 64)
            .mapToObj(i -> new ReentrantLock()).toArray(ReentrantLock[]::new);

    @org.springframework.beans.factory.annotation.Autowired
    public ConsultPersonalWebService(ConsultSessionRepository sessions,
            WebResourceGateway gateway, ConsultPersonalWebRepository accounts, ObjectMapper mapper) {
        this(sessions, gateway, accounts, mapper, System::currentTimeMillis);
    }
    ConsultPersonalWebService(ConsultSessionRepository sessions,
            WebResourceGateway gateway, ConsultPersonalWebRepository accounts, ObjectMapper mapper, java.util.function.LongSupplier now) {
        this.sessions = sessions; this.gateway = gateway;
        this.accounts = accounts; this.mapper = mapper; this.now = now;
    }
    public record Credentials(String siteUrl, String environment, String username,
                              @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) String password,
                              String loginPage) {
        @Override public String toString() { return "PersonalWebCredentials[redacted]"; }
    }
    public record State(boolean configured, String siteUrl, String environment, String username, String loginPage,
                        String loginStatus, long checkedAt, Object result) { }

    public State status(String consultId) {
        var session = owner(consultId);
        return accounts.find(session.getUserId(), session.getSystemSourcePath()).map(value -> state(value, null))
                .orElse(new State(false, null, null, null, null, "NOT_CONFIGURED", 0, null));
    }
    public State login(String consultId, Credentials input) {
        var session = owner(consultId);
        validate(input);
        return locked(session, () -> {
            var previous = current(session);
            String id = "personal-" + UUID.randomUUID();
            var value = new Account(id, session.getUserId(), session.getSystemSourcePath(), input.siteUrl().trim(),
                    input.environment(), input.username(), accounts.encrypt(input.password()), input.loginPage(), "NOT_CHECKED", 0);
            try {
                Object result = gateway.readPersonal(key(value), value.sourcePath(), target(value),
                        new WebResourceGateway.Request(id, null, value.environment(), value.loginPage()));
                // 网页目标通过原有系统/环境/URL检查后才保存；未READY也明确保留登录失败状态。
                value = checked(value, result);
                accounts.save(value);
                if (previous != null) { gateway.closePersonal(key(previous)); }
                return state(value, result);
            } catch (RuntimeException failure) {
                gateway.closePersonal(key(value));
                throw new IllegalArgumentException("账号保存或登录未完成，请查询绑定状态后核对系统、站点、环境及登录页");
            }
        });
    }
    /** 明确检查允许用户在密码、验证码或外部故障修复后重新尝试一次。 */
    public State check(String consultId) {
        var session = owner(consultId);
        return locked(session, () -> {
            var value = required(session);
            if (!"READY".equals(value.loginStatus())) { gateway.closePersonal(key(value)); }
            Object result = perform(value, null);
            return state(checked(value, result), result);
        });
    }
    /** 解除绑定同时撤销后续咨询复用；失败不声称已释放浏览器。 */
    public void logout(String consultId) {
        var session = owner(consultId);
        locked(session, () -> {
            var value = current(session);
            if (value != null) { gateway.closePersonal(key(value)); accounts.delete(value); }
            return null;
        });
    }
    public List<ReadonlyResourceGateway.Entry> discover(ConsultSession session) {
        var value = current(session);
        return value == null ? List.of() : List.of(new ReadonlyResourceGateway.Entry(value.id(), "personal", "本人绑定", "个人账号",
                value.environment(), "本人声明环境（未独立核验）；绑定不等于已登录，读取时检查", "AVAILABLE", null, value.siteUrl(), "APP"));
    }
    public Object read(ConsultSession session, WebResourceGateway.Request request) {
        return locked(session, () -> {
            var value = required(session);
            if (!value.id().equals(request.bindingId())) { throw new IllegalArgumentException("个人账号不属于当前用户与系统，请重新发现绑定"); }
            if (request.environment() != null && !request.environment().equals(value.environment())) {
                throw new IllegalArgumentException("个人账号环境不匹配");
            }
            if (!"READY".equals(value.loginStatus())) {
                throw new IllegalArgumentException("个人账号上次登录未成功，请在个人账号入口检查登录或更新账号，不自动重复尝试");
            }
            return perform(value, request.url());
        });
    }
    private Object perform(Account value, String url) {
        try {
            Object result = gateway.readPersonal(key(value), value.sourcePath(), target(value),
                    new WebResourceGateway.Request(value.id(), url, value.environment(), value.loginPage()));
            var next = checked(value, result);
            // 错误业务路径/403/404不等于账号失效，不阻断后续更正路径的读取。
            if (url == null || !"FAILED".equals(next.loginStatus())) {
                accounts.checked(value, next.loginStatus(), next.checkedAt());
            }
            return result;
        } catch (RuntimeException failure) {
            accounts.checked(value, "CHECK_FAILED", now.getAsLong());
            throw new IllegalArgumentException("登录检查未完成，请稍后检查登录或更新本人账号；未返回页面内容");
        }
    }
    private Account checked(Account value, Object result) {
        String status = mapper.valueToTree(result).path("page").path("status").asText("CHECK_FAILED");
        if (!List.of("READY", "WAITING_LOGIN", "FAILED").contains(status)) { status = "CHECK_FAILED"; }
        return new Account(value.id(), value.owner(), value.sourcePath(), value.siteUrl(), value.environment(),
                value.username(), value.passwordCipher(), value.loginPage(), status, now.getAsLong());
    }
    private BrowserLoginTarget target(Account value) {
        return new BrowserLoginTarget(value.id(), "本人绑定账号", value.environment(), value.siteUrl(), value.username(),
                accounts.password(value), "username", "password");
    }
    private Account required(ConsultSession session) {
        var value = current(session);
        if (value == null) { throw new IllegalArgumentException("当前用户尚未绑定此系统的个人账号"); }
        return value;
    }
    private Account current(ConsultSession session) {
        if (session.getUserId() == null || session.getUserId().isBlank() || session.getSystemSourcePath() == null
                || !"PENDING".equals(session.getArchiveStatus())) { return null; }
        return accounts.find(session.getUserId(), session.getSystemSourcePath()).orElse(null);
    }
    private ConsultSession owner(String id) {
        var principal = AuthContext.current().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        var session = sessions.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!String.valueOf(principal.userId()).equals(session.getUserId())) { throw new ResponseStatusException(HttpStatus.NOT_FOUND); }
        if (!"PENDING".equals(session.getArchiveStatus())) { throw new IllegalArgumentException("咨询已归档，不能使用个人账号"); }
        if (session.getSystemSourcePath() == null || session.getSystemSourcePath().isBlank()) {
            throw new IllegalArgumentException("本次咨询缺少账号保存归属，请重新打开咨询");
        }
        return session;
    }
    private <T> T locked(ConsultSession session, Supplier<T> action) {
        var lock = locks[Math.floorMod(java.util.Objects.hash(session.getUserId(), session.getSystemSourcePath()), locks.length)];
        if (!lock.tryLock()) { throw new ResponseStatusException(HttpStatus.CONFLICT, "账号操作进行中，请稍后查询状态"); }
        try { return action.get(); } finally { lock.unlock(); }
    }
    private String key(Account value) { return "personal:" + value.id(); }
    private State state(Account value, Object result) {
        // 状态读取只返回上次检查，不将保存的READY当作当前在线保证。
        String status = now.getAsLong() - value.checkedAt() > 60_000 && "READY".equals(value.loginStatus()) ? "CHECK_REQUIRED" : value.loginStatus();
        return new State(true, value.siteUrl(), value.environment(), value.username(), value.loginPage(), status, value.checkedAt(), result);
    }
    private void validate(Credentials input) {
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
    }
    private boolean bounded(String value, int max) { return value != null && !value.isBlank() && value.length() <= max; }
}
