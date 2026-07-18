package com.exceptioncoder.toolbox.knowledgegraph.model;

import java.util.List;

public record ModuleGap(
        String moduleKey,
        String moduleName,
        int existingCount,
        List<String> missingTypes
) {
}
