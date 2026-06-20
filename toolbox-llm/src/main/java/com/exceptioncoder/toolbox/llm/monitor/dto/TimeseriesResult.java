package com.exceptioncoder.toolbox.llm.monitor.dto;

import java.util.List;

/** /timeseries 响应。 */
public record TimeseriesResult(String bucket, String metric, List<TsPoint> points) {
}
