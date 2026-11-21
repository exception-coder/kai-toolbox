package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.common.resource.WebPageReader;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.PlaywrightException;
import com.microsoft.playwright.Request;
import com.microsoft.playwright.Route;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.ScreenshotType;
import com.microsoft.playwright.options.ServiceWorkerPolicy;
import com.microsoft.playwright.options.WaitUntilState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;

/** 无头渲染及人工接管；与录制会话、登录态自动落盘严格隔离。 */
@Component
class PlaywrightPreviewBrowser implements PreviewBrowser {
    private static final Logger log = LoggerFactory.getLogger(PlaywrightPreviewBrowser.class);
    private static final Set<String> READ_METHODS = Set.of("GET", "HEAD", "OPTIONS");
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
            if (plan.readOnly()) { options.setServiceWorkers(ServiceWorkerPolicy.BLOCK); }
            if (plan.storageState() != null) {
                options.setStorageState(plan.storageState());
            }
            BrowserContext context = browser.newContext(options);
            contexts.put(id, context);
            var authenticating = new java.util.concurrent.atomic.AtomicBoolean(plan.login() != null);
            var loginSubmission = new java.util.concurrent.atomic.AtomicReference<String>();
            configureNetwork(context, plan.origin(), plan.readOnly(), request -> {
                String url = request.url();
                return authenticating.get() && sameOrigin(plan.origin(), url)
                        && (url.equals(loginSubmission.get()) || (plan.login() != null && plan.login().loginRequestPath() != null
                        && url.equals(plan.origin() + plan.login().loginRequestPath()))
                        || credentialLoginRequest(plan.login(), request.method(), url, request.postData()));
            });
            Page page = context.newPage();
            pages.put(id, page);
            try {
                if (plan.login() != null) {
                    stage.accept("AUTHENTICATING");
                    if (!login(page, plan, loginSubmission)) {
                        if (plan.readOnly()) { log.info("咨询网页登录未通过表单或响应校验"); }
                        stage.accept("WAITING_LOGIN");
                        return null;
                    }
                }
                authenticating.set(false);
                navigate(page, plan, stage);
            } catch (RuntimeException failure) {
                if (plan.readOnly()) {
                    log.info("咨询网页读取中断，阶段={}，异常类型={}", authenticating.get() ? "登录" : "读取目标页",
                            failure.getClass().getSimpleName());
                }
                boolean waitingForLogin = plan.readOnly() ? authenticating.get() : plan.login() != null;
                stage.accept(waitingForLogin ? "WAITING_LOGIN" : "FAILED");
            } finally {
                authenticating.set(false);
                if (cancelled.getAsBoolean()) {
                    pages.remove(id); contexts.remove(id); context.close();
                }
            }
            return null;
        });
    }

    private boolean login(Page page, PreviewPlan plan, java.util.concurrent.atomic.AtomicReference<String> submission) {
        page.navigate(plan.origin() + plan.loginPage(), new Page.NavigateOptions()
                .setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
        Locator passwords = page.locator("input[type=password]:visible");
        if (passwords.count() == 0) {
            Locator loginButton = page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("登录").setExact(true));
            if (loginButton.count() == 1) {
                loginButton.click();
            }
        }
        passwords.first().waitFor();
        if (passwords.count() != 1 || !plan.login().usernameField().matches("[A-Za-z0-9_.-]+")
                || !plan.login().passwordField().matches("[A-Za-z0-9_.-]+")) {
            return false;
        }
        // 传统登录页常把输入区域绝对定位，form本身高度为0；依据可见密码框定位所属表单。
        Locator form = page.locator("form:has(input[type=password]:visible)");
        if (form.count() > 1) { return false; }
        Locator scope = form.count() == 1 ? form : page.locator("body");
        Locator username = scope.locator("input[name='" + plan.login().usernameField() + "']:visible");
        if (username.count() == 0 && "username".equals(plan.login().usernameField())) {
            username = scope.locator("input[autocomplete=username]:visible");
            if (username.count() == 0) {
                username = scope.locator("input[type=text]:visible,input[type=email]:visible,input:not([type]):visible");
            }
        }
        Locator password = scope.locator("input[name='" + plan.login().passwordField() + "'][type=password]:visible");
        if (password.count() == 0 && "password".equals(plan.login().passwordField())) { password = passwords; }
        if (username.count() != 1 || password.count() != 1) { return false; }
        Locator submit = scope.locator("button[type=submit]:visible,input[type=submit]:visible");
        if (plan.readOnly() || submit.count() != 1) {
            submit = scope.getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName(
                    java.util.regex.Pattern.compile("登\\s*[录入]|sign\\s*in|log\\s*in|进入系统", java.util.regex.Pattern.CASE_INSENSITIVE)));
        }
        if (submit.count() != 1) { return false; }
        username.fill(plan.login().username());
        password.fill(plan.login().password());
        if (form.count() == 1) { submission.set((String) form.evaluate("form => form.action")); }
        if (plan.readOnly()) {
            // 咨询只读路由已限制非只读请求为登录提交。等待最终响应，避免失败页或加载提示隐藏密码框后误报成功。
            String getFormPath = (String) submit.evaluate("""
                    el => el.form && (el.hasAttribute('formmethod') ? el.formMethod : el.form.method) === 'get'
                      ? new URL(el.hasAttribute('formaction') ? el.formAction : el.form.action).pathname : null
                    """);
            var loginResponse = page.waitForResponse(response -> {
                if (response.status() >= 300 && response.status() < 400 || !sameOrigin(plan.origin(), response.url())) {
                    return false;
                }
                var request = response.request();
                while (request.redirectedFrom() != null) { request = request.redirectedFrom(); }
                if (request.frame() != page.mainFrame() || !sameOrigin(plan.origin(), request.url())) { return false; }
                return !READ_METHODS.contains(request.method())
                        || "GET".equals(request.method()) && request.isNavigationRequest()
                        && URI.create(request.url()).getRawPath().equals(getFormPath);
            }, submit::click);
            log.info("咨询网页登录提交收到最终响应，HTTP={}", loginResponse.status());
            if (!loginResponse.ok()) { return false; }
        } else {
            submit.click();
        }
        passwords.waitFor(new Locator.WaitForOptions().setState(com.microsoft.playwright.options.WaitForSelectorState.HIDDEN));
        return true;
    }

    /** 兼容常见SPA登录：只识别同源登录阶段、明确登录端点及包含本次双凭据的POST。 */
    static boolean credentialLoginRequest(com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget account,
                                          String method, String url, String body) {
        if (account == null || account.username() == null || account.username().isBlank()
                || account.password() == null || account.password().isBlank()
                || !"POST".equals(method) || body == null || body.length() > 16384
                || !sameOrigin(account.baseUrl(), url)) { return false; }
        String path = URI.create(url).getPath();
        if (!path.matches("(?i).*/(?:login|signin|sign-in|authenticate|authentication|token|session)(?:\\.(?:do|json|action))?/?$")) { return false; }
        try {
            java.util.List<String> values = new java.util.ArrayList<>();
            if (body.stripLeading().startsWith("{")) {
                var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
                json.elements().forEachRemaining(value -> { if (value.isTextual()) { values.add(value.textValue()); } });
            } else {
                for (String part : body.split("&")) {
                    int split = part.indexOf('=');
                    if (split >= 0) { values.add(java.net.URLDecoder.decode(part.substring(split + 1), java.nio.charset.StandardCharsets.UTF_8)); }
                }
            }
            return values.contains(account.username()) && values.contains(account.password());
        } catch (Exception invalid) { return false; }
    }

    private void navigate(Page page, PreviewPlan plan, Consumer<String> stage) {
        stage.accept("NAVIGATING");
        String destination = plan.origin() + plan.route();
        // 默认入口本身可能永远展示登录页；登录后检查实际落点，不能再次回到登录表单。
        if (plan.login() != null && plan.route().equals(plan.loginPage()) && sameOrigin(plan.origin(), page.url())
                && !URI.create(page.url()).getRawPath().equals(URI.create(destination).getRawPath())) {
            destination = page.url();
        }
        var response = page.navigate(destination, new Page.NavigateOptions()
                .setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
        if (response != null && response.status() >= 400) {
            stage.accept(response.status() == 401 ? "WAITING_LOGIN" : "FAILED");
            return;
        }
        String selector = plan.readySelector() == null || plan.readySelector().isBlank() ? "h1,h2" : plan.readySelector();
        page.locator(selector).first().waitFor();
        if (page.locator("input[type=password]:visible").count() > 0) {
            if (plan.readOnly()) { log.info("咨询目标页显示登录表单，未读取受保护内容"); }
            stage.accept("WAITING_LOGIN");
            return;
        }
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
    public com.exceptioncoder.toolbox.common.resource.WebPageReader.Page read(String id, String status) {
        return manager.withRenderingBrowser(browser -> {
            Page page = required(id);
            String text = page.locator("body").innerText();
            String actual = page.locator("input[type=password]:visible").count() > 0 ? "WAITING_LOGIN" : status;
            URI url = URI.create(page.url());
            return new com.exceptioncoder.toolbox.common.resource.WebPageReader.Page(actual,
                    url.getScheme() + "://" + url.getRawAuthority() + url.getRawPath(), page.title(),
                    text.length() > 20000 ? text.substring(0, 20000) : text);
        });
    }

    @Override
    public WebPageReader.Page readMenu(String id, String baseUrl, String menuName) {
        return manager.withRenderingBrowser(browser -> {
            Page accountPage = required(id);
            String verifiedUrl = accountPage.url();
            URI base = URI.create(baseUrl);
            String origin = base.getScheme() + "://" + base.getRawAuthority();
            if (!ConsultMenu.isWithinApplication(baseUrl, verifiedUrl)) {
                return new WebPageReader.Page("MENU_UNAVAILABLE", origin, "未取得菜单内容", "菜单页超出已授权的站点或应用路径，未点击。");
            }
            String safeUrl = origin + URI.create(verifiedUrl).getRawPath();
            BrowserContext original = accountPage.context();
            BrowserContext next = null;
            try {
                next = browser.newContext(new Browser.NewContextOptions().setViewportSize(accountPage.viewportSize())
                        .setLocale("zh-CN").setAcceptDownloads(false).setServiceWorkers(ServiceWorkerPolicy.BLOCK)
                        .setStorageState(original.storageState(new BrowserContext.StorageStateOptions().setIndexedDB(true))));
                configureNetwork(next, origin, true, request -> false);
                Page nextPage = next.newPage();
                copyTabStorage(accountPage, nextPage, verifiedUrl);
                if (!verifiedUrl.equals(accountPage.url()) || accountPage.locator("input[type=password]:visible").count() > 0) {
                    return new WebPageReader.Page("MENU_UNAVAILABLE", safeUrl, "未取得菜单内容", "菜单页已变更或登录已失效，未点击。");
                }
                contexts.put(id, next);
                pages.put(id, nextPage);
                next = null; // 交给原账号绑定及其既有关闭/到期逻辑。
            } catch (PlaywrightException unavailable) {
                return new WebPageReader.Page("MENU_UNAVAILABLE", safeUrl, "未取得菜单内容", "无法隔离菜单操作并保留登录态，未点击。");
            } finally {
                if (next != null) { next.close(); }
            }
            try {
                return ConsultMenu.read(accountPage, baseUrl, menuName);
            } finally {
                // 点击始终发生在已核验的原 DOM 上；该上下文断网后不再恢复网络。
                original.close();
            }
        });
    }

    private static void configureNetwork(BrowserContext context, String origin, boolean readOnly, Predicate<Request> allowLogin) {
        context.setDefaultTimeout(15000);
        context.setDefaultNavigationTimeout(20000);
        if (readOnly) {
            context.routeWebSocket("**/*", socket -> socket.close());
            context.addInitScript("window.WebSocket = class { constructor() { throw new Error('咨询不开放WebSocket'); } }; navigator.sendBeacon = () => false;");
        }
        context.route("**/*", route -> {
            Request request = route.request();
            if ((readOnly && !READ_METHODS.contains(request.method()) && !allowLogin.test(request))
                    || (request.isNavigationRequest() && !sameOrigin(origin, request.url()))) {
                route.abort();
            } else { route.resume(); }
        });
    }

    private static void copyTabStorage(Page source, Page destination, String url) {
        // storageState 包含 Cookie、本地存储和 IndexedDB。单标签的 sessionStorage 通过同源空文档单独恢复。
        Object entries = source.evaluate("""
                expected => {
                  if (location.href !== expected) throw new Error('菜单页已变更');
                  return Object.entries(sessionStorage);
                }
                """, url);
        // 空文档占据原地址，让下次读取沿用正常导航（包括登录后的默认落点），不向站点重发 GET。
        Consumer<Route> blank = route -> route.fulfill(new Route.FulfillOptions().setContentType("text/html")
                .setHeaders(Map.of("Content-Security-Policy", "default-src 'none'")).setBody("<html></html>"));
        destination.route("**/*", blank);
        try {
            destination.navigate(url);
            if (entries instanceof List<?> values && !values.isEmpty()) {
                destination.evaluate("items => items.forEach(([key, value]) => sessionStorage.setItem(key, value))", values);
            }
        } finally { destination.unroute("**/*", blank); }
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
