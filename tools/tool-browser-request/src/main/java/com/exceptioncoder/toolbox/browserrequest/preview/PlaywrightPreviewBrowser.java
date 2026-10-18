package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.ScreenshotType;
import com.microsoft.playwright.options.WaitUntilState;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.BooleanSupplier;

/** 无头渲染及人工接管；与录制会话、登录态自动落盘严格隔离。 */
@Component
class PlaywrightPreviewBrowser implements PreviewBrowser {
    private final BrowserSessionManager manager;
    private final Map<String, BrowserContext> contexts = new HashMap<>();
    private final Map<String, Page> pages = new HashMap<>();

    PlaywrightPreviewBrowser(BrowserSessionManager manager) { this.manager = manager; }

    @Override
    public void open(String id, PreviewPlan plan, Consumer<String> stage, BooleanSupplier cancelled) {
        manager.withRenderingBrowser(browser -> {
            if (cancelled.getAsBoolean()) { return null; }
            Browser.NewContextOptions options = new Browser.NewContextOptions()
                    .setViewportSize(plan.phone() ? 390 : 1440, plan.phone() ? 844 : 900)
                    .setIsMobile(plan.phone()).setHasTouch(plan.phone()).setLocale("zh-CN");
            if (plan.storageState() != null) {
                options.setStorageState(plan.storageState());
            }
            BrowserContext context = browser.newContext(options);
            contexts.put(id, context);
            context.setDefaultTimeout(15000);
            context.setDefaultNavigationTimeout(20000);
            context.route("**/*", route -> {
                if (route.request().isNavigationRequest() && !sameOrigin(plan.origin(), route.request().url())) {
                    route.abort();
                } else {
                    route.resume();
                }
            });
            Page page = context.newPage();
            pages.put(id, page);
            try {
                if (plan.login() != null) {
                    stage.accept("AUTHENTICATING");
                    if (!login(page, plan)) {
                        stage.accept("WAITING_LOGIN");
                        return null;
                    }
                }
                navigate(page, plan, stage);
            } catch (RuntimeException failure) {
                stage.accept(plan.login() != null ? "WAITING_LOGIN" : "FAILED");
            } finally {
                if (cancelled.getAsBoolean()) {
                    pages.remove(id); contexts.remove(id); context.close();
                }
            }
            return null;
        });
    }

    private boolean login(Page page, PreviewPlan plan) {
        page.navigate(plan.origin() + plan.loginPage(), new Page.NavigateOptions()
                .setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
        Locator form = page.locator("form:has(input[type=password]):visible");
        if (form.count() == 0) {
            Locator loginButton = page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("登录").setExact(true));
            if (loginButton.count() == 1) {
                loginButton.click();
            }
        }
        form.waitFor();
        if (form.count() != 1 || !plan.login().usernameField().matches("[A-Za-z0-9_.-]+")
                || !plan.login().passwordField().matches("[A-Za-z0-9_.-]+")) {
            return false;
        }
        form.locator("input[name='" + plan.login().usernameField() + "']").fill(plan.login().username());
        form.locator("input[name='" + plan.login().passwordField() + "'][type=password]").fill(plan.login().password());
        form.locator("button[type=submit],input[type=submit]").click();
        form.waitFor(new Locator.WaitForOptions().setState(com.microsoft.playwright.options.WaitForSelectorState.HIDDEN));
        return true;
    }

    private void navigate(Page page, PreviewPlan plan, Consumer<String> stage) {
        stage.accept("NAVIGATING");
        var response = page.navigate(plan.origin() + plan.route(), new Page.NavigateOptions()
                .setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
        if (response != null && response.status() >= 400) {
            stage.accept("FAILED");
            return;
        }
        String selector = plan.readySelector() == null || plan.readySelector().isBlank() ? "h1,h2" : plan.readySelector();
        page.locator(selector).first().waitFor();
        if (page.getByText("无权访问", new Page.GetByTextOptions().setExact(true)).count() > 0) {
            stage.accept("FAILED");
            return;
        }
        if ("consult-image".equals(plan.scene())) {
            Locator conversation = page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("查看对话").setExact(true));
            if (conversation.count() == 1 && conversation.isVisible()) {
                conversation.click();
            }
            page.locator("img:visible").first().click();
            page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("关闭图片预览").setExact(true)).waitFor();
        }
        stage.accept("READY");
    }

    @Override
    public void resume(String id, PreviewPlan plan, Consumer<String> stage, BooleanSupplier cancelled) {
        manager.withRenderingBrowser(browser -> {
            if (!cancelled.getAsBoolean()) {
                try { navigate(required(id), plan, stage); }
                catch (RuntimeException failure) { stage.accept("FAILED"); }
            }
            return null;
        });
    }

    @Override
    public byte[] screenshot(String id) {
        return manager.withRenderingBrowser(browser -> required(id).screenshot(new Page.ScreenshotOptions()
                .setType(ScreenshotType.JPEG).setQuality(75)));
    }

    @Override
    public void input(String id, PreviewInput input) {
        manager.withRenderingBrowser(browser -> {
            Page page = required(id);
            switch (input.type()) {
                case "click" -> page.mouse().click(coordinate(input.x(), page.viewportSize().width),
                        coordinate(input.y(), page.viewportSize().height));
                case "scroll" -> page.mouse().wheel(0, Math.max(-1200, Math.min(1200,
                        input.deltaY() == null ? 0 : input.deltaY())));
                case "text" -> page.keyboard().insertText(input.text() == null ? "" : input.text());
                case "key" -> {
                    if (!Set.of("Enter", "Escape", "Tab", "Backspace", "ArrowDown", "ArrowUp").contains(input.key())) {
                        throw new IllegalArgumentException("不支持的按键");
                    }
                    page.keyboard().press(input.key());
                }
                default -> throw new IllegalArgumentException("不支持的预览操作");
            }
            return null;
        });
    }

    private double coordinate(Double value, int size) {
        if (value == null || !Double.isFinite(value) || value < 0 || value > 1) {
            throw new IllegalArgumentException("点击坐标必须在画面范围内");
        }
        return Math.min(size - 1, value * size);
    }

    private Page required(String id) {
        Page page = pages.get(id);
        if (page == null || page.isClosed()) {
            throw new IllegalArgumentException("预览已关闭，请重新打开");
        }
        return page;
    }

    @Override
    public void close(String id) {
        manager.withRenderingBrowser(browser -> {
            pages.remove(id);
            BrowserContext context = contexts.remove(id);
            if (context != null) {
                context.close();
            }
            return null;
        });
    }

    static boolean sameOrigin(String base, String url) {
        try {
            URI uri = URI.create(url);
            String origin = uri.getScheme() + "://" + uri.getHost()
                    + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
            return PreviewTargets.origin(base).equals(PreviewTargets.origin(origin));
        } catch (RuntimeException invalid) {
            return false;
        }
    }
}
