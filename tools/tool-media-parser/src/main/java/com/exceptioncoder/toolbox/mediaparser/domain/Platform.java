package com.exceptioncoder.toolbox.mediaparser.domain;

public enum Platform {

    TIKTOK("tiktok.com", "vm.tiktok.com", "vt.tiktok.com"),
    DOUYIN("douyin.com", "v.douyin.com"),
    INSTAGRAM("instagram.com", "instagr.am"),
    YOUTUBE("youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"),
    TWITTER("twitter.com", "x.com"),
    REDDIT("reddit.com", "redd.it"),
    PINTEREST("pinterest.com", "pin.it"),
    FACEBOOK("facebook.com", "fb.watch"),
    BILIBILI("bilibili.com", "b23.tv"),
    XIAOHONGSHU("xiaohongshu.com", "xhslink.com"),
    UNKNOWN;

    private final String[] hosts;

    Platform(String... hosts) { this.hosts = hosts; }
    Platform() { this.hosts = new String[0]; }

    public static Platform detect(String url) {
        if (url == null || url.isBlank()) return UNKNOWN;
        String lower = url.toLowerCase();
        for (Platform p : values()) {
            if (p == UNKNOWN) continue;
            for (String host : p.hosts) {
                if (lower.contains(host)) return p;
            }
        }
        return UNKNOWN;
    }
}
