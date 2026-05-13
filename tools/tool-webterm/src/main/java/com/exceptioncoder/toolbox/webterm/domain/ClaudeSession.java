package com.exceptioncoder.toolbox.webterm.domain;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ClaudeSession {
    private String id;
    private String cwd;
    private String shell;
    private String title;
    private long startedAt;
    private long lastSeenAt;
}
