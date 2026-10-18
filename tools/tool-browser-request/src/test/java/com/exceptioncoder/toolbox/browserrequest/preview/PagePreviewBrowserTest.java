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
    @Test void rendersLoginRouteAndPhoneFrameInAnIsolatedHeadlessContext() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String body;
            if ("/session".equals(path)) {
                String form = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                if (!form.contains("username=test-user") || !form.contains("password=test-password")) {
                    exchange.sendResponseHeaders(403, -1); exchange.close(); return;
                }
                exchange.getResponseHeaders().add("Set-Cookie", "preview-session=authenticated; Path=/; HttpOnly");
                exchange.getResponseHeaders().add("Location", "/target");
                exchange.sendResponseHeaders(302, -1); exchange.close(); return;
            } else if ("/login".equals(path)) {
                body = "<html><meta charset='utf-8'><form method='post' action='/session'>"
                        + "<input name='username' autocomplete='username'><input name='password' type='password'>"
                        + "<button type='submit'>登录</button></form></html>";
            } else if ("/target".equals(path) && "preview-session=authenticated".equals(exchange.getRequestHeaders().getFirst("Cookie"))) {
                body = "<html><meta charset='utf-8'><h1>登录后的目标页面</h1><p>真实渲染引擎验收</p></html>";
            } else {
                exchange.sendResponseHeaders(401, -1); exchange.close(); return;
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
        } finally { manager.shutdown(); server.stop(0); }
    }
}
