package com.exceptioncoder.toolbox.browserrequest.api.dto;

import com.exceptioncoder.toolbox.browserrequest.service.BrowserRequestService;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * 批量执行的请求体：
 *   items     —— JSON 数组（前端从响应/变量池/手粘里得来）
 *   request   —— 循环体模板（curl 或结构化），里面可用 {{item.xxx}} 占位
 *   aggregate —— 可选；每次响应再用 jsonPath 提取一个值，最后聚合存到变量池
 */
public record ForeachRequest(
        JsonNode items,
        ExecuteRequestBody request,
        BrowserRequestService.AggregateSpec aggregate
) {}
