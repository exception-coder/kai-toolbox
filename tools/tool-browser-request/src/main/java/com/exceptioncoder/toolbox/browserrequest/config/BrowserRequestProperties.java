package com.exceptioncoder.toolbox.browserrequest.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "toolbox.browser-request")
public class BrowserRequestProperties {
    /** storage state / 截图等会话产物存放根目录，留空则取 ${user.home}/.kai-toolbox/browser-request */
    private String dataDir;
    /** 是否允许多会话同时开启，默认 true。 */
    private boolean allowMultiSession = true;
    /** 是否 headless。默认 false——必须可见浏览器供用户手动登录。 */
    private boolean headless = false;
    /** 单次 page/api 请求超时（毫秒）。 */
    private int requestTimeoutMs = 60_000;
    /** 跨进程：启动 Chromium 时透传到 BrowserType.LaunchOptions 的额外参数。 */
    private String proxy;
    /** 是否启用 storage state 自动落盘。关掉则只能手动点「保存登录态」。 */
    private boolean autoSaveEnabled = true;
    /** 自动保存间隔（毫秒）。默认 30s——cookies 几 KB 到数百 KB，写盘 IO 可忽略。 */
    private long autoSaveIntervalMs = 30_000;
}
