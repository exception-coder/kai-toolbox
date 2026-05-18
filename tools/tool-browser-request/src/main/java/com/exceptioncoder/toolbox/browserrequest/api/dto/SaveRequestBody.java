package com.exceptioncoder.toolbox.browserrequest.api.dto;

import java.util.List;
import java.util.Map;

public record SaveRequestBody(String name, String curl, String method, String url,
                              Map<String, String> headers, String body,
                              List<PipelineDtos.OutputSpec> outputs,
                              /** 可选：执行后的响应体，用作编排参考样本（后端截断到 256KB）。 */
                              String lastResponseBody) {}
