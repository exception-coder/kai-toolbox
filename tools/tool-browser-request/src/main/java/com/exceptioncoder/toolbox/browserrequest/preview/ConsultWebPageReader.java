package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import com.exceptioncoder.toolbox.common.resource.WebPageReader;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** 咨询网页只允许登录和读取；隔离上下文按咨询、绑定及配置指纹复用，不重复撞密码。 */
@Component
class ConsultWebPageReader implements WebPageReader {
    private final PreviewBrowser browser;
    private final Map<String, Context> contexts = new HashMap<>();
    ConsultWebPageReader(PreviewBrowser browser) { this.browser = browser; }

    @Override
    public synchronized Page read(String key, BrowserLoginTarget account, String path, String loginPage) {
        String fingerprint = fingerprint(account);
        Context current = contexts.get(key);
        if (current != null && !current.fingerprint.equals(fingerprint)) { close(key, current); current = null; }
        if (current == null) {
            if (contexts.size() >= 8) { throw new IllegalArgumentException("咨询网页会话已满，请稍后重试"); }
            current = new Context(UUID.randomUUID().toString(), fingerprint);
            contexts.put(key, current);
            Context captured = current;
            CompletableFuture.delayedExecutor(15, TimeUnit.MINUTES).execute(() -> close(key, captured));
            try {
                browser.open(current.id, plan(account, path, loginPage), captured::stage, () -> false);
            } catch (RuntimeException failed) { current.status.set("FAILED"); }
        } else if (current.navigable) {
            try { browser.resume(current.id, plan(account, path, loginPage), current.status::set, () -> false); }
            catch (RuntimeException failed) { current.status.set("FAILED"); }
        }
        try {
            Page result = browser.read(current.id, current.status.get());
            current.status.set(result.status());
            return new Page(result.status(), result.url(), redact(result.title(), account.password()), redact(result.text(), account.password()));
        } catch (RuntimeException failed) {
            current.status.set("FAILED");
            return new Page("FAILED", URI.create(account.baseUrl()).getScheme() + "://" + URI.create(account.baseUrl()).getRawAuthority(),
                    "页面读取未完成", "浏览器不可用或登录失败，未自动重试同一账号；请核对资源中心或使用其他已授权账号。");
        }
    }

    private PreviewPlan plan(BrowserLoginTarget account, String path, String loginPage) {
        URI uri = URI.create(account.baseUrl());
        String origin = uri.getScheme() + "://" + uri.getRawAuthority();
        return new PreviewPlan(origin, path, loginPage, "body", "page", false, null, account, true);
    }

    private String fingerprint(BrowserLoginTarget value) {
        try {
            String raw = value.id() + value.baseUrl() + value.username() + value.password()
                    + value.usernameField() + value.passwordField() + value.loginRequestPath();
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private String redact(String text, String secret) {
        return text == null ? "" : secret == null || secret.isEmpty() ? text : text.replace(secret, "[已隐藏]");
    }
    private synchronized void close(String key, Context expected) {
        if (contexts.get(key) != expected) { return; }
        contexts.remove(key);
        try { browser.close(expected.id); } catch (RuntimeException ignored) { /* 浏览器断连时不输出引擎或凭据异常。 */ }
    }
    @jakarta.annotation.PreDestroy
    public synchronized void shutdown() { new HashMap<>(contexts).forEach(this::close); }
    private static class Context {
        final String id;
        final String fingerprint;
        volatile boolean navigable;
        void stage(String value) { status.set(value); if ("NAVIGATING".equals(value)) { navigable = true; } }
        final AtomicReference<String> status = new AtomicReference<>("STARTING");
        Context(String id, String fingerprint) { this.id = id; this.fingerprint = fingerprint; }
    }
}
