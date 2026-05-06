package com.exceptioncoder.toolbox.mediaparser.api.dto;

import com.exceptioncoder.toolbox.mediaparser.domain.MediaItemType;
import com.exceptioncoder.toolbox.mediaparser.domain.ParseResult;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

public record ParseResultView(
        String platform,
        String type,
        String title,
        String author,
        String thumbnail,
        List<MediaItemView> items
) {
    public record MediaItemView(
            String type,
            String url,      // points to /api/media-parser/download
            String quality,
            String mimeType
    ) {}

    public static ParseResultView from(ParseResult result) {
        String encodedOriginal = result.getOriginalUrl() != null
                ? URLEncoder.encode(result.getOriginalUrl(), StandardCharsets.UTF_8)
                : "";

        List<MediaItemView> items = result.getItems() == null ? List.of() :
                result.getItems().stream()
                        .map(item -> {
                            String downloadUrl;
                            if (item.getDirectUrl() != null && !item.getDirectUrl().isBlank()) {
                                // Fallback parser CDN link — proxy through backend
                                String encodedCdn = URLEncoder.encode(item.getDirectUrl(), StandardCharsets.UTF_8);
                                downloadUrl = "/api/media-parser/download?cdnUrl=" + encodedCdn;
                                if (item.getReferer() != null && !item.getReferer().isBlank()) {
                                    downloadUrl += "&referer=" + URLEncoder.encode(item.getReferer(), StandardCharsets.UTF_8);
                                }
                            } else {
                                // yt-dlp format selector — backend runs yt-dlp to download
                                String mode = MediaItemType.AUDIO == item.getType() ? "audio" : "video";
                                downloadUrl = "/api/media-parser/download?url=" + encodedOriginal + "&mode=" + mode;
                            }
                            return new MediaItemView(
                                    item.getType().name(),
                                    downloadUrl,
                                    item.getQuality(),
                                    item.getMimeType());
                        })
                        .toList();

        return new ParseResultView(
                result.getPlatform().name(),
                result.getType().name(),
                result.getTitle(),
                result.getAuthor(),
                result.getThumbnail(),
                items);
    }
}
