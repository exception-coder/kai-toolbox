package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/** 有界、按用户隔离的预览生命周期；认证信息仅在短期内存中使用。 */
@Service
public class PagePreviewService {
    private static final long IDLE_TIMEOUT_MS = TimeUnit.MINUTES.toMillis(15);
    private static final Set<String> DISPLAYABLE = Set.of("READY", "WAITING_LOGIN", "FAILED");
    private final Clock clock;
    private final PreviewTargets targets;
    private final PreviewBrowser browser;
    private final Map<String, Run> runs = new ConcurrentHashMap<>();
    private final Map<String, String> requests = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    PagePreviewService(PreviewTargets targets, PreviewBrowser browser) {
        this(targets, browser, Clock.systemUTC());
    }

    PagePreviewService(PreviewTargets targets, PreviewBrowser browser, Clock clock) {
        this.targets = targets;
        this.browser = browser;
        this.clock = clock;
    }

    public synchronized View create(PreviewRequest request, AuthPrincipal user, String token) {
        runs.values().forEach(run -> {
            synchronized (run) {
                if (run.expiresAt <= clock.millis()) {
                    finish(run, "EXPIRED");
                    runs.remove(run.id); requests.remove(run.key);
                }
            }
        });
        String key = user.userId() + ":" + request.requestKey();
        Run existing = runs.get(requests.getOrDefault(key, ""));
        if (existing != null) {
            if (!existing.request.equals(request)) {
                throw new IllegalArgumentException("相同预览请求标识不能用于不同目标");
            }
            return view(existing);
        }
        long active = runs.values().stream().filter(run -> !terminal(run.status)).count();
        if (active >= 4 || runs.size() >= 64) {
            throw new IllegalArgumentException("预览会话已达上限，请关闭不用的预览后重试");
        }
        PreviewPlan plan = targets.resolve(request, user, token);
        long expires = Math.min(clock.millis() + IDLE_TIMEOUT_MS, user.expiresAt());
        Run run = new Run(UUID.randomUUID().toString(), key, request, user.userId(), expires, plan, user.username());
        runs.put(run.id, run);
        requests.put(key, run.id);
        Thread.startVirtualThread(() -> start(run));
        armTimeout(run);
        armExpiry(run);
        return view(run);
    }

    private void start(Run run) {
        try {
            browser.open(run.id, run.plan, stage -> update(run, stage), () -> terminal(run.status));
        } catch (RuntimeException failure) {
            update(run, "FAILED");
        } finally {
            run.plan = null;
        }
    }

    private void armTimeout(Run run) {
        long attempt;
        synchronized (run) { attempt = ++run.attempt; }
        CompletableFuture.delayedExecutor(90, TimeUnit.SECONDS).execute(() -> {
            synchronized (run) {
                if (attempt == run.attempt && Set.of("STARTING", "AUTHENTICATING", "NAVIGATING").contains(run.status)) {
                    finish(run, "TIMED_OUT");
                }
            }
        });
    }

    private void update(Run run, String status) {
        synchronized (run) {
            if (!terminal(run.status)) { run.status = status; }
        }
    }

    public View resume(String id, AuthPrincipal user) {
        Run run = required(id, user);
        synchronized (run) {
            if (!Set.of("WAITING_LOGIN", "FAILED").contains(run.status)) {
                throw new IllegalArgumentException("当前状态不能继续登录后的导航");
            }
            run.status = "NAVIGATING";
        }
        armTimeout(run);
        Thread.startVirtualThread(() -> {
            try { browser.resume(id, run.destination, stage -> update(run, stage), () -> terminal(run.status)); }
            catch (RuntimeException failure) { update(run, "FAILED"); }
        });
        return view(run);
    }

    public View get(String id, AuthPrincipal user) { return view(required(id, user)); }

    public byte[] screenshot(String id, AuthPrincipal user) {
        Run run = required(id, user);
        if (!DISPLAYABLE.contains(run.status)) {
            throw new IllegalArgumentException("画面尚未就绪或已结束");
        }
        return browser.screenshot(id);
    }

    public void input(String id, AuthPrincipal user, PreviewInput input) {
        Run run = required(id, user);
        if (!DISPLAYABLE.contains(run.status)) {
            throw new IllegalArgumentException("当前预览不能接管操作");
        }
        try {
            browser.input(id, input);
        } catch (RuntimeException failure) {
            throw new IllegalArgumentException("页面操作失败，请刷新预览后重试");
        }
    }

    public void close(String id, AuthPrincipal user) { finish(required(id, user), "CLOSED"); }

    private Run required(String id, AuthPrincipal user) {
        Run run = runs.get(id);
        if (run == null || run.owner != user.userId()) {
            throw AuthException.forbidden();
        }
        long now = clock.millis();
        if (user.expiresAt() <= now) throw AuthException.tokenInvalid();
        synchronized (run) {
            if (run.expiresAt <= now) finish(run, "EXPIRED");
            if (!terminal(run.status)) {
                // 每个请求均已验证当前用户令牌，滑动延长闲置期限，不保留或延长旧令牌。
                run.expiresAt = Math.max(run.expiresAt, Math.min(now + IDLE_TIMEOUT_MS, user.expiresAt()));
            }
        }
        return run;
    }

    private void armExpiry(Run run) {
        CompletableFuture.delayedExecutor(Math.max(1, run.expiresAt - clock.millis()), TimeUnit.MILLISECONDS)
                .execute(() -> checkExpiry(run.id));
    }

    /** 每个会话只保留一条定时检查链；旧截止时间不能关闭已续期的会话。 */
    void checkExpiry(String id) {
        Run run = runs.get(id);
        if (run == null) return;
        synchronized (run) {
            if (terminal(run.status)) return;
            if (run.expiresAt <= clock.millis()) finish(run, "EXPIRED");
            else armExpiry(run);
        }
    }

    private void finish(Run run, String status) {
        synchronized (run) {
            if (terminal(run.status)) {
                return;
            }
            run.status = status;
            run.plan = null;
        }
        Thread.startVirtualThread(() -> {
            try { browser.close(run.id); } catch (RuntimeException ignored) {
                // 浏览器断连时上下文已不可用；状态仍须保持结束，不泄露引擎异常中的凭据。
            }
        });
    }

    private static boolean terminal(String state) { return Set.of("CLOSED", "EXPIRED", "TIMED_OUT").contains(state); }

    private View view(Run run) {
        return new View(run.id, run.status, run.request, run.origin, run.account, run.environment, "运行版本尚未核验", run.expiresAt,
                "/tools/fore-consult/preview/" + run.id);
    }

    @PreDestroy
    public void shutdown() { runs.values().forEach(run -> finish(run, "CLOSED")); }

    /** 预览元信息；不包含浏览器登录状态或凭据。 */
    public record View(String id, String status, PreviewRequest target, String targetOrigin, String account,
                       String environment, String runtimeVersion, long expiresAt, String viewerPath) { }

    private static class Run {
        final String id;
        final String key;
        final PreviewRequest request;
        final long owner;
        volatile long expiresAt;
        final String origin;
        final String account;
        final String environment;
        final PreviewPlan destination;
        volatile PreviewPlan plan;
        long attempt;
        volatile String status = "STARTING";
        Run(String id, String key, PreviewRequest request, long owner, long expiresAt, PreviewPlan plan, String username) {
            this.id = id; this.key = key; this.request = request; this.owner = owner;
            this.expiresAt = expiresAt; this.plan = plan; this.origin = plan.origin();
            this.destination = new PreviewPlan(plan.origin(), plan.route(), null, plan.readySelector(), plan.scene(), plan.phone(), null, null);
            this.account = plan.login() == null ? username : plan.login().username();
            this.environment = plan.login() == null ? "Forge 当前环境" : plan.login().environment();
        }
    }
}
