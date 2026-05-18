package com.exceptioncoder.toolbox.browserrequest.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 会话级变量，对应 {@code browser_request_var} 表，用于请求模板 {{name}} 替换。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BrowserVar {
    private String sessionId;
    private String name;
    private String value;
    private long updatedAt;
}
