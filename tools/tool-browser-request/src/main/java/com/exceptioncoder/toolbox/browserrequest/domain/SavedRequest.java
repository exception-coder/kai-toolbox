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
    private long createdAt;
    private long updatedAt;
}
