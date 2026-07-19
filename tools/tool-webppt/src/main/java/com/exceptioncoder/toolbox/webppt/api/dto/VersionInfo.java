package com.exceptioncoder.toolbox.webppt.api.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class VersionInfo {
    private String version;
    private String createdAt;
    private String summary;
    private boolean isActive;
}
