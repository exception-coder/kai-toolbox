package com.exceptioncoder.toolbox.knowledgegraph.model;

import java.time.Instant;

public record ProjectRef(
        String path,
        String displayName,
        Instant lastUsedAt
) {
}
