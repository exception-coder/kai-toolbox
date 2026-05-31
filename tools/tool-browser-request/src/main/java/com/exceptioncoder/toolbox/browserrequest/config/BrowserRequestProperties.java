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
    /**
     * 自动保存间隔（毫秒）。默认 15 min——`ctx.storageState()` 在 Windows 下可能短暂抢前台 + 占
     * Playwright worker 几十毫秒；cookies 一般 24h+ 有效，间隔拉长几分钟到一刻钟几乎无副作用。
     * 录制过程中 SessionAutoSaver 会进一步 skip 本次 tick。
     */
    private long autoSaveIntervalMs = 15 * 60 * 1000L;

    // ── 站点录制编排 相关配置 ────────────────────────────────────────────────

    /** 单次录制最大时长（毫秒）。超过自动 STOP。默认 60 min。 */
    private long recordingMaxDurationMs = 60L * 60L * 1000L;
    /** 单次录制最大调用数。超过自动 STOP。默认 5000。 */
    private int recordingMaxCalls = 5000;
    /**
     * 响应体硬上限（字节）。前端每次开录可在此之内选具体截断位（见 StartRecordingRequest.responseBodyTruncateAtBytes）。
     * 默认 32 MB——超过这个量级通常是文件下载/大流，Playwright worker 同步等 body 会显著拖卡浏览器，
     * cached content-length 一旦告诉我们已超过该值就直接跳过不读 body。
     */
    private int responseBodyMaxBytes = 32 * 1024 * 1024;
    /** 敏感字段关键词（URL query / body 命中即不入库 body）。 */
    private String[] sensitiveKeywords = { "password", "pwd", "token", "secret", "credential" };
    /** 回放 step 之间的间隔（毫秒）。默认 200。 */
    private int replayStepIntervalMs = 200;
}
