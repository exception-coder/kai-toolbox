package com.exceptioncoder.toolbox.browserrequest.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 反检测配置集中处。三段相互独立：
 * <ol>
 *   <li>{@link #UA}                —— 浏览器身份（UA / 平台一致性的源头）</li>
 *   <li>{@link #chromiumArgs()}    —— Chromium 启动参数（影响进程行为）</li>
 *   <li>{@link #ignoreDefaultArgs()} —— 屏蔽 Playwright 默认追加的自动化参数</li>
 *   <li>{@link #extraHttpHeaders()} —— 默认 HTTP 头（含 Sec-CH-UA 等）</li>
 *   <li>{@link #initScript()}      —— 注入到每个文档执行前的 JS（resources/stealth/stealth.js）</li>
 * </ol>
 *
 * 设计选择：
 * <ul>
 *   <li>UA 固定为 Windows + Chrome 135，搭配脚本里 {@code navigator.platform='Win32'} 保持一致</li>
 *   <li>不引入 BOSS / yuque 等业务专属拦截逻辑，那是 page 层的事</li>
 *   <li>不开 {@code --no-sandbox} / {@code --disable-gpu} / {@code --disable-web-security}
 *       —— 它们本身是 fingerprint，反而暴露自动化</li>
 * </ul>
 */
@Slf4j
public final class StealthConfig {

    private StealthConfig() {}

    // ── 1. 浏览器身份 ────────────────────────────────────────────────────────

    /** 与 stealth.js 内的 navigator.platform='Win32' 保持一致。 */
    public static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

    public static final String LOCALE = "zh-CN";
    public static final String TIMEZONE = "Asia/Shanghai";

    // ── 2. Chromium 启动参数 ─────────────────────────────────────────────────

    public static List<String> chromiumArgs() {
        return List.of(
                // 反自动化检测：必须最先关掉这两个特征
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",

                // 关闭站点隔离 —— init script 才能注入到所有同源 frame
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-site-isolation-trials",

                // 跳过初次运行的 UX 弹窗（不影响指纹）
                "--no-first-run",
                "--no-default-browser-check",
                "--password-store=basic",
                "--use-mock-keychain"
        );
    }

    /** 屏蔽 Playwright 默认会加的 --enable-automation（控制台横幅 + navigator.webdriver=true）。 */
    public static List<String> ignoreDefaultArgs() {
        return List.of("--enable-automation");
    }

    // ── 3. 默认 HTTP 头（含 Client Hints）────────────────────────────────────

    /**
     * Sec-CH-UA 系列必须和 UA 自洽：Chrome 135 + Windows + 非移动端。
     * Accept-Language 决定 navigator.languages 起始值（但脚本里又做了显式覆盖兜底）。
     */
    public static Map<String, String> extraHttpHeaders() {
        return Map.of(
                "Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8",
                "Sec-CH-UA", "\"Chromium\";v=\"135\", \"Not.A/Brand\";v=\"24\", \"Google Chrome\";v=\"135\"",
                "Sec-CH-UA-Mobile", "?0",
                "Sec-CH-UA-Platform", "\"Windows\""
        );
    }

    // ── 4. 反检测 JS（从 classpath 加载） ────────────────────────────────────

    private static final String INIT_SCRIPT = loadInitScript();

    public static String initScript() { return INIT_SCRIPT; }

    private static String loadInitScript() {
        try (InputStream in = new ClassPathResource("stealth/stealth.js").getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("[BrowserRequest] 无法加载 stealth/stealth.js，反检测将退化", e);
            return "/* stealth.js missing */";
        }
    }
}
