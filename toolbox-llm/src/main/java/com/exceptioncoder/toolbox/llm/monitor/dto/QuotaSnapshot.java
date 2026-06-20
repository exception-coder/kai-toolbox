package com.exceptioncoder.toolbox.llm.monitor.dto;

import java.util.List;

/** /quota 响应：当日滚动窗口配额水位。 */
public record QuotaSnapshot(String window, String currency, List<QuotaStatus> items) {
}
