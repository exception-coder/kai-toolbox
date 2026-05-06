package com.exceptioncoder.toolbox.mediaparser.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MediaItem {
    private MediaItemType type;
    private String quality;        // 人类可读标签，如 "1080p"、"HD"
    private String formatSelector; // yt-dlp 格式选择器（与 directUrl 二选一）
    private String directUrl;      // 备用站点返回的 CDN 直链（与 formatSelector 二选一）
    private String referer;        // CDN 直链需要的 Referer（如抖音/小红书视频）；null 表示不需要
    private String mimeType;
}
