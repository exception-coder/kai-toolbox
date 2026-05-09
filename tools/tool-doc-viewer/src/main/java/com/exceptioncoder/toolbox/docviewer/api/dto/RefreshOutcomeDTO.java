package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class RefreshOutcomeDTO {
    private String id;
    /** NOT_MODIFIED | UPDATED | RATE_LIMITED | COOLDOWN */
    private String outcome;
    private String treeETag;
    private long lastRefreshedAt;
    private Long rateLimitUntil;
    private boolean rateLimited;
}
