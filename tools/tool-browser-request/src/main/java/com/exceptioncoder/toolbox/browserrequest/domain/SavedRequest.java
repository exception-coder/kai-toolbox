package com.exceptioncoder.toolbox.browserrequest.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 收藏的请求。curl 字段非空时优先用 curl，否则用 method/url/headers/body。headers 以 JSON 文本存储。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SavedRequest {
    private String id;
    private String sessionId;
    private String name;
    private String curl;
    private String method;
    private String url;
    /** JSON 序列化的 Map<String,String>。 */
    private String headersJson;
    private String body;
    /** OutputSpec[] 序列化后的 JSON。null/空数组表示无 outputs 配置。 */
    private String outputsJson;
    /** 最近一次执行的响应体（截断后 ≤ 256KB），编排时作参考样本帮助配 outputs。 */
    private String lastResponseBody;
    /** 最近一次响应的时间戳（epoch ms），null 表示从未执行过。 */
    private Long lastResponseAt;
    /**
     * 每条 output 最近一次提取的值，JSON 序列化的 {@code Map<String,String>}（output 名 → stringified 值）。
     * 编排运行时把所有 saved 的此 map 合并喂给 TemplateRenderer。
     */
    private String lastExtractedValuesJson;
    private long createdAt;
    private long updatedAt;
}
