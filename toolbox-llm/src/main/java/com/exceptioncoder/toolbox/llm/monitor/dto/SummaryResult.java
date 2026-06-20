package com.exceptioncoder.toolbox.llm.monitor.dto;

import java.util.List;

/** /summary 响应：总量 + 分组。 */
public record SummaryResult(
        String from,
        String to,
        Totals totals,
        List<GroupStat> groups) {
}
