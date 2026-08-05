package com.exceptioncoder.toolbox.quicklaunch.api.dto;

import com.exceptioncoder.toolbox.quicklaunch.domain.OpenMode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record QuickSiteUpsertRequest(
        @NotBlank @Size(max = 100) String title,
        @NotBlank @Size(max = 2000) String siteUrl,
        @Size(max = 64) String groupName,
        @Size(max = 64) String icon,
        OpenMode openMode,
        @Min(480) @Max(3840) Integer windowWidth,
        @Min(360) @Max(2160) Integer windowHeight,
        @Min(-10000) @Max(10000) Integer sortOrder,
        Boolean pinned,
        Boolean enabled
) {
}
