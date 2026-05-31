package com.exceptioncoder.toolbox.magnet.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 磁力 / BT 模块配置。
 *
 * <h3>架构</h3>
 * 本机跑 aria2c 子进程负责真正的 BT 下载（走家庭带宽）；
 * 提交磁力前 toolbox 先并发查多个公共种子缓存站，命中就拿 .torrent 喂给 aria2，
 * 跳过 DHT 拉 metadata 的几十秒。
 */
@Data
@ConfigurationProperties(prefix = "toolbox.magnet")
public class MagnetProperties {

    private boolean enabled = true;

    /** aria2c 二进制路径。默认走 PATH；环境变量 TOOLBOX_ARIA2_BINARY 覆盖。 */
    private String binary = "aria2c";

    /** 默认下载保存目录。 */
    private String defaultSavePath;

    // ---------- RPC ----------

    private int rpcPort = 6800;
    private String rpcSecret = "";
    private int startupTimeoutMs = 10_000;
    private int stopGraceMs = 3_000;

    // ---------- BT / DHT ----------

    private boolean enableDht = true;
    private boolean enableLpd = true;
    private boolean btMetadataOnly = false;
    private boolean btSaveMetadata = true;
    private int seedTimeSeconds = 0;
    private int btListenPort = 51413;

    // ---------- 并发 / 限速 ----------

    private int maxConcurrentDownloads = 5;
    private int maxConnectionsPerServer = 16;
    private long maxUploadLimitBps = 0;

    /** 周期打印当前活跃任务摘要 + 任务状态翻转（开始/完成/失败）的间隔，秒。≤0 关闭。 */
    private int progressLogIntervalSeconds = 10;

    /**
     * HTTP/HTTPS 代理。仅影响 aria2 的 HTTP/HTTPS 下载、HTTP(S) tracker、FTP。
     * 不影响 UDP tracker / DHT / BT peer wire。
     */
    private String proxy;

    // ---------- 持久化 ----------

    private String sessionFile;
    private String dhtFilePath;

    /** DHT 引导节点。aria2 默认值在国内访问差，自定义一批可达节点显著提升 DHT 接入速度。 */
    private java.util.List<String> dhtEntryPoints = java.util.List.of(
            "dht.transmissionbt.com:6881",
            "router.bittorrent.com:6881",
            "router.utorrent.com:6881",
            "dht.libtorrent.org:25401",
            "dht.aelitis.com:6881"
    );

    /** 追加 BT tracker 列表（兜底磁力链自带 tracker 失效时仍能找到 peer）。 */
    private java.util.List<String> trackers = java.util.List.of(
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://open.demonii.com:1337/announce",
            "udp://open.stealth.si:80/announce",
            "udp://exodus.desync.com:6969/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://opentracker.io:6969/announce",
            "udp://tracker.tiny-vps.com:6969/announce",
            "udp://tracker.dler.org:6969/announce",
            "udp://retracker01-msk-virt.corbina.net:80/announce",
            "http://tracker.openbittorrent.com:80/announce"
    );

    // ---------- 提交前的 .torrent 缓存解析 ----------

    /**
     * 公共种子缓存解析器。提交磁力链时先并发查这些镜像，命中后直接拿 .torrent
     * 字节喂给 aria2，跳过 DHT metadata 阶段（这是 webtor 那种「瞬时解析」的核心）。
     */
    private Resolver resolver = new Resolver();

    @Data
    public static class Resolver {
        /** 关闭后所有磁力都走原生 aria2 DHT 解析。 */
        private boolean enabled = true;

        /**
         * .torrent 元数据回源镜像 URL 模版。占位符：
         * <ul>
         *   <li>{HASH} → 40 字符小写 hex</li>
         *   <li>{HASH_UPPER} → 大写 hex</li>
         * </ul>
         * 列表里的镜像并发请求，第一个返 200 + bencode 头的胜出；全 miss 才退回 aria2 原生 DHT。
         *
         * <p>默认指向自托管的 metadata-fetcher（部署见 docs/metadata-fetcher/README.md）。
         * 2024+ 公共 .torrent 缓存站（itorrents/torrage/btcache）几乎全死,所以默认列表里没有了。
         * 自己跑一个机房上的 metadata-fetcher 是当前唯一可靠的方案。
         */
        private java.util.List<String> mirrors = java.util.List.of(
                "http://170.106.186.65:9000/metadata/{HASH_UPPER}"
        );

        /**
         * 单镜像超时（ms）。
         * <p>自托管 metadata-fetcher 通常 5-15s 命中热门种子,冷门可能要 30-60s,
         * 配 65s 给一点 fudge factor。如果你换回公共镜像,把这个改到 4000 即可。
         */
        private int perMirrorTimeoutMs = 65_000;

        /** 整体等待上限（ms）：所有镜像都超时就放弃,fallback 走原生 aria2 DHT。 */
        private int totalTimeoutMs = 70_000;

        /** 单文件大小上限（字节），防御镜像返回奇怪的大文件。 */
        private int maxBytes = 8 * 1024 * 1024;

        /**
         * 是否让 resolver 走 {@link MagnetProperties#proxy}。
         * <p>自托管 metadata-fetcher 在你自己的 VPS 上(国内可直连),默认 false 直连更快。
         * 如果还在用公共镜像(那些必被墙),改 true 走代理。
         */
        private boolean useGlobalProxy = false;
    }
}
