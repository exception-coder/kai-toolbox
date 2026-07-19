package com.exceptioncoder.toolbox.webppt.api.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class VersionsResponse {
    private List<VersionInfo> versions;
}
