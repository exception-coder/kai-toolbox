package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserRequestProperties;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named = "preview.browser-test", matches = "true")
class PagePreviewBrowserTest {
    @TempDir Path temporary;

    @Test void resolvesRuntimeModulesWhenSwitchingChildApplicationsAfterTheShellHasLoaded() {
        BrowserRequestProperties properties = new BrowserRequestProperties();
        properties.setDataDir(temporary.toString());
        BrowserSessionManager manager = new BrowserSessionManager(properties, new ObjectMapper());
        String fixture = """
                <html><head><meta charset="utf-8">
                <script type="importmap">{"imports":{"shell-runtime":"data:text/javascript,export default 'shell'"}}</script>
                </head><body><button id="alpha">应用甲</button><button id="beta">应用乙</button>
                <div id="result">loading</div><script type="module">
                import shell from 'shell-runtime';
                const result = document.querySelector('#result');
                let revision = 0;
                async function activate(name) {
                  result.dataset.state = 'loading';
                  const key = '__ck_fixture_' + (++revision) + '/__runtime__';
                  const map = document.createElement('script');
                  map.type = 'importmap';
                  map.textContent = JSON.stringify({ imports: {
                    [key]: 'data:text/javascript,' + encodeURIComponent('export default ' + JSON.stringify(name))
                  }});
                  document.head.appendChild(map);
                  try { result.textContent = (await import(key)).default; }
                  catch (error) { result.textContent = 'ERROR: ' + error.message; }
                  result.dataset.state = 'done';
                }
                document.querySelector('#alpha').onclick = () => activate('应用甲');
                document.querySelector('#beta').onclick = () => activate('应用乙');
                result.textContent = shell;
                result.dataset.state = 'done';
                </script></body></html>
                """;
        try {
            manager.withRenderingBrowser(browser -> {
                for (boolean phone : List.of(false, true)) {
                    try (var context = browser.newContext(new com.microsoft.playwright.Browser.NewContextOptions()
                            .setViewportSize(phone ? 390 : 1440, phone ? 844 : 900)
                            .setIsMobile(phone).setHasTouch(phone))) {
                        var page = context.newPage();
                        page.setDefaultTimeout(5000);
                        page.setContent(fixture);
                        page.waitForFunction("() => document.querySelector('#result').dataset.state === 'done'");
                        assertEquals("shell", page.locator("#result").innerText());
                        for (String app : List.of("alpha", "beta", "alpha")) {
                            page.locator("#" + app).click();
                            page.waitForFunction("() => document.querySelector('#result').dataset.state === 'done'");
                            assertEquals("alpha".equals(app) ? "应用甲" : "应用乙", page.locator("#result").innerText(),
                                    "Chromium " + browser.version() + ", phone=" + phone + ", app=" + app);
                        }
                    }
                }
                return null;
            });
        } finally { manager.shutdown(); }
    }

    @Test void logsIntoAnUnambiguousSpaWithoutInputNamesAndDoesNotReportLoginPagesAsReady() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var submissions = new java.util.concurrent.atomic.AtomicInteger();
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String body;
            if ("/api/login".equals(path)) {
                submissions.incrementAndGet();
                String json = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                if (!json.contains("test-user") || !json.contains("test-password")) {
                    exchange.sendResponseHeaders(403, -1); exchange.close(); return;
                }
                body = "{}";
            } else if ("/spa-target".equals(path)) {
                body = "<html><script>if(localStorage.getItem('fixture-auth')!=='yes'){location.href='/spa-login'}</script><h1>登录后的SPA</h1></html>";
            } else if ("/login-heading".equals(path)) {
                body = "<html><h1>请登录</h1><input type=password></html>";
            } else {
                body = "<html><meta charset=utf-8><input autocomplete=username id=u>"
                        + ("/ambiguous".equals(path) ? "<input type=password><input type=password>" : "<input type=password id=p>")
                        + "<button id=submit>登录</button><script>document.getElementById('submit').onclick=async()=>{"
                        + "await fetch('/api/login',{method:'POST',body:JSON.stringify({username:document.getElementById('u').value,password:document.getElementById('p').value})});"
                        + "localStorage.setItem('fixture-auth','yes');location.href='/spa-target'}</script></html>";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html;charset=UTF-8");
            exchange.sendResponseHeaders(200, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        BrowserRequestProperties properties = new BrowserRequestProperties(); properties.setDataDir(temporary.toString());
        BrowserSessionManager manager = new BrowserSessionManager(properties, new ObjectMapper());
        PlaywrightPreviewBrowser browser = new PlaywrightPreviewBrowser(manager);
        try {
            String origin = "http://127.0.0.1:" + server.getAddress().getPort();
            BrowserLoginTarget account = new BrowserLoginTarget("spa", "SPA", "TEST", origin,
                    "test-user", "test-password", "username", "password");
            List<String> stages = new ArrayList<>();
            browser.open("spa", new PreviewPlan(origin, "/spa-target", "/spa-login", "h1", "page", false, null, account, true), stages::add, () -> false);
            assertEquals(List.of("AUTHENTICATING", "NAVIGATING", "READY"), stages);
            assertEquals(1, submissions.get());
            stages.clear();
            browser.resume("spa", new PreviewPlan(origin, "/login-heading", null, "h1", "page", false, null, null), stages::add, () -> false);
            assertEquals(List.of("NAVIGATING", "WAITING_LOGIN"), stages);
            browser.close("spa");
            stages.clear();
            browser.open("ambiguous", new PreviewPlan(origin, "/spa-target", "/ambiguous", "h1", "page", false, null, account), stages::add, () -> false);
            assertEquals(List.of("AUTHENTICATING", "WAITING_LOGIN"), stages);
            assertEquals(1, submissions.get(), "存在多个密码框时不应猜测账号或提交");
            browser.close("ambiguous");
        } finally { manager.shutdown(); server.stop(0); }
    }
    @Test void rendersLoginRouteAndPhoneFrameInAnIsolatedHeadlessContext() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var logins = new java.util.concurrent.atomic.AtomicInteger();
        var writes = new java.util.concurrent.atomic.AtomicInteger();
        var cookieValid = new java.util.concurrent.atomic.AtomicBoolean(true);
        var rejectLogin = new java.util.concurrent.atomic.AtomicBoolean(false);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String body;
            if ("/mutate".equals(path)) { writes.incrementAndGet(); exchange.sendResponseHeaders(204, -1); exchange.close(); return; }
            if ("/j_spring_security_check".equals(path)) {
                logins.incrementAndGet();
                String form = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                if (rejectLogin.get() || !form.contains("username=test-user") || !form.contains("password=test-password")) {
                    exchange.sendResponseHeaders(403, -1); exchange.close(); return;
                }
                cookieValid.set(true);
                exchange.getResponseHeaders().add("Set-Cookie", "preview-session=authenticated; Path=/; HttpOnly");
                exchange.getResponseHeaders().add("Location", "/target");
                exchange.sendResponseHeaders(302, -1); exchange.close(); return;
            } else if ("/login".equals(path)) {
                body = "<html><meta charset='utf-8'><form method='post' action='/j_spring_security_check'>"
                        + "<div style='position:absolute;top:40px;left:40px'>"
                        + "<input name='username' autocomplete='username'><input name='password' type='password'>"
                        + "<input type='submit' value='登录'></div></form></html>";
            } else if ("/api/items".equals(path) && "preview-session=authenticated".equals(exchange.getRequestHeaders().getFirst("Cookie"))) {
                byte[] json = "{\"item\":\"0011\",\"composition\":\"cotton\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, json.length); exchange.getResponseBody().write(json); exchange.close(); return;
            } else if ("/menu".equals(path) && cookieValid.get() && "preview-session=authenticated".equals(exchange.getRequestHeaders().getFirst("Cookie"))) {
                body = """
                        <meta charset='utf-8'><nav>
                        <button aria-controls='links' aria-expanded='false'
                            onclick="this.setAttribute('aria-expanded','true');document.getElementById('links').hidden=false;fetch('/mutate').catch(()=>{});fetch('/mutate',{method:'POST'}).catch(()=>{})">业务菜单</button>
                        <ul id='links' hidden><li>现货销售</li><li>采购管理</li></ul>
                        <button aria-controls='remote' aria-expanded='false'
                            onclick="this.setAttribute('aria-expanded','true');document.getElementById('remote').hidden=false;fetch('/mutate').catch(()=>{})">远程菜单</button>
                        <div id='remote' hidden>加载中</div>
                        <details><summary>个人设置</summary><ul><li>菜单偏好</li></ul></details></nav>
                        <button onclick="location.href='/mutate'">提交</button>
                        """;
            } else if ("/target".equals(path) && cookieValid.get() && "preview-session=authenticated".equals(exchange.getRequestHeaders().getFirst("Cookie"))) {
                body = "<html><meta charset='utf-8'><h1>登录后的目标页面</h1><p>真实渲染引擎验收 test-password</p><script>fetch('/mutate',{method:'POST'}).catch(()=>{});try{new WebSocket('ws://'+location.host+'/mutate')}catch(e){}</script></html>";
            } else {
                exchange.sendResponseHeaders("/missing".equals(path) ? 404 : 401, -1); exchange.close(); return;
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html;charset=UTF-8");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        BrowserRequestProperties properties = new BrowserRequestProperties();
        properties.setDataDir(temporary.toString());
        BrowserSessionManager manager = new BrowserSessionManager(properties, new ObjectMapper());
        PlaywrightPreviewBrowser browser = new PlaywrightPreviewBrowser(manager);
        try {
            String origin = "http://127.0.0.1:" + server.getAddress().getPort();
            BrowserLoginTarget account = new BrowserLoginTarget("test", "测试", "TEST", origin,
                    "test-user", "test-password", "username", "password");
            List<String> stages = new ArrayList<>();
            browser.open("test", new PreviewPlan(origin, "/target", "/login", "h1", "page", true, null, account),
                    stages::add, () -> false);
            assertEquals(List.of("AUTHENTICATING", "NAVIGATING", "READY"), stages);
            byte[] frame = browser.screenshot("test");
            var image = ImageIO.read(new ByteArrayInputStream(frame));
            assertEquals(390, image.getWidth()); assertEquals(844, image.getHeight());
            Files.write(Path.of("target/page-preview-render.jpg"), frame);
            assertTrue(manager.getOpenSessionIds().isEmpty());
            assertFalse(Files.exists(temporary.resolve("test/storage-state.json")));
            stages.clear();
            browser.resume("test", new PreviewPlan(origin, "/target", null, "h1", "page", true, null, null),
                    stages::add, () -> false);
            assertEquals(List.of("NAVIGATING", "READY"), stages);
            browser.close("test");
            writes.set(0); logins.set(0);
            var reader = new ConsultWebPageReader(browser);
            try {
                var first = reader.read("consult:binding", account, "/target", "/login");
                assertEquals("READY", first.status());
                assertFalse(first.text().contains("test-password"));
                assertEquals("READY", reader.read("consult:binding", account, "/target", "/login").status());
                assertEquals("FAILED", reader.read("consult:binding", account, "/missing", "/login").status());
                assertEquals("READY", reader.read("consult:binding", account, "/target", "/login").status());
                var api = reader.read("consult:binding", account, "/api/items?item=0011", "/login");
                assertEquals("READY", api.status());
                assertTrue(api.text().contains("0011"));
                assertTrue(api.text().contains("cotton"));
                assertEquals(1, logins.get(), "页面和GET接口复用同一登录态，且错误路径可更正");
                assertEquals(0, writes.get(), "咨询页面不应执行非登录POST或WebSocket");
                reader.closeContext("consult:binding");
                assertEquals("READY", reader.read("consult:binding", account, "/target", "/login").status());
                assertEquals(2, logins.get(), "主动退出后必须重新登录，不能复用旧Cookie");
                logins.set(0);
                var bad = new BrowserLoginTarget("bad", "错误账号", "TEST", origin, "wrong-user", "test-password", "username", "password");
                var failedLogin = reader.read("consult:bad", bad, "/target", "/login");
                assertNotEquals("READY", failedLogin.status());
                assertTrue(failedLogin.text().contains("未返回页面正文"));
                assertNotEquals("READY", reader.read("consult:bad", bad, "/target", "/login").status());
                assertEquals(1, logins.get(), "同一失败账号不可自动重复登录");
                logins.set(0);
                assertEquals("READY", reader.read("personal:persisted", account, "/target", "/login").status());
                cookieValid.set(false);
                assertEquals("READY", reader.read("personal:persisted", account, "/target", "/login").status());
                assertEquals(2, logins.get(), "Cookie失效后个人绑定自动恢复一次");
                cookieValid.set(false); rejectLogin.set(true);
                assertEquals("WAITING_LOGIN", reader.read("personal:persisted", account, "/target", "/login").status());
                assertEquals("WAITING_LOGIN", reader.read("personal:persisted", account, "/target", "/login").status());
                assertEquals(3, logins.get(), "重登失败不重复撞密码");
                rejectLogin.set(false);
                assertEquals("READY", reader.read("personal:landing", account, "/login", "/login").status(),
                        "默认入口即登录页时，检查登录后的落点，不能再次返回登录页");
                assertEquals("READY", reader.read("personal:landing", account, "/login", "/login").status(),
                        "后续检查重新读取落点，仍检查真实登录态");
                var closed = reader.read("consult:menus", account, "/menu", "/login");
                assertEquals("READY", closed.status());
                assertFalse(closed.text().contains("采购管理"));
                var menu = reader.read("consult:menus", account, "/menu", "/login", "业务菜单");
                assertEquals("READY", menu.status(), menu.text());
                assertTrue(menu.text().contains("采购管理"));
                assertFalse(menu.text().contains("提交"), "只返回菜单面板");
                assertTrue(reader.read("consult:menus", account, "/menu", "/login", "个人设置").text().contains("菜单偏好"));
                assertEquals("MENU_UNAVAILABLE", reader.read("consult:menus", account, "/menu", "/login", "远程菜单").status());
                assertEquals("MENU_UNAVAILABLE", reader.read("consult:menus", account, "/menu", "/login", "提交").status());
                assertEquals(0, writes.get(), "展开菜单的处理程序不能触发 GET 或 POST 写操作");
            } finally { reader.shutdown(); }
        } finally { manager.shutdown(); server.stop(0); }
    }
}
