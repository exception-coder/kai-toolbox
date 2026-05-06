package com.exceptioncoder.toolbox.mediaparser.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "toolbox.media-parser")
public class MediaParserProperties {
    private String ytDlpBinary = "yt-dlp";
    private String ffmpegBinary = "ffmpeg";
    private int connectTimeoutSeconds = 10;
    private int readTimeoutSeconds = 60;
    private int downloadTimeoutSeconds = 300;
    /** 统一代理地址，例如 http://127.0.0.1:7890；留空则全部走直连。 */
    private String proxy;
    /** Playwright 浏览器降级（抖音/小红书等需要绕 Cloudflare/反爬时用）。 */
    private Playwright playwright = new Playwright();
    /** 解析失败时，把页面 HTML / 抓到的 JSON 转储到这个目录便于离线分析；空则使用 ${user.home}/.kai-toolbox/media-parser/dumps */
    private String dumpDir;

    @Data
    public static class Playwright {
        /** 是否启用。首次启动会下载 ~150MB Chromium 到 ~/.cache/ms-playwright/ */
        private boolean enabled = false;
        private boolean headless = true;
        /** 单次页面操作的超时（毫秒）。Cloudflare 挑战 + 网络渲染加起来留点余量。 */
        private int pageTimeoutMs = 30_000;
    }
}
