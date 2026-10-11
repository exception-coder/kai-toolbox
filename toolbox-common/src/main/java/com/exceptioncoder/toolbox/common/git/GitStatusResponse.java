package com.exceptioncoder.toolbox.common.git;

import java.util.List;

/** Git 状态及其中匹配忽略规则的路径；匹配规则不改变暂存区或跟踪状态。 */
public record GitStatusResponse(List<GitStatusEntry> entries, List<String> ignoredPaths) {
    public GitStatusResponse(List<GitStatusEntry> entries) {
        this(entries, List.of());
    }
}
