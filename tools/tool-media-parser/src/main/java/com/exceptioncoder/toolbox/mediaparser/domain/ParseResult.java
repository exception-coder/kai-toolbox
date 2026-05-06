package com.exceptioncoder.toolbox.mediaparser.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParseResult {
    private Platform platform;
    private ResultType type;
    private String title;
    private String author;
    private String thumbnail;
    private List<MediaItem> items;
    private String originalUrl;  // 用户提交的原始链接，供下载接口转发
}
