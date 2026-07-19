package com.exceptioncoder.toolbox.webppt.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class VersionInfo {
    private String version;
    private String createdAt;
    private String summary;
    /**
     * Lombok 为 boolean 字段 isActive 生成的 getter 是 isActive()（已带 is 前缀不再重复），
     * Jackson 默认会把它序列化成属性名 active 而非 isActive，需显式指定 JSON 属性名，
     * 否则前端按文档约定读取的 isActive 永远是 undefined。
     */
    @JsonProperty("isActive")
    private boolean isActive;
}
