package com.exceptioncoder.toolbox.browserrequest.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 浏览器会话元数据，对应 {@code browser_request_session} 表。运行态（BrowserContext 句柄）在 BrowserSessionManager 内存中。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BrowserSession {
    private String id;
    private String name;
    /** 首次打开导航到的 URL。 */
    private String url;
    /** 是否已落盘 storage state（cookie/localStorage）。 */
    private boolean hasStorage;
    /** 最近一次「打开」或「执行请求」的时间戳（epoch ms），null 表示未活跃过。 */
    private Long lastActiveAt;
    private long createdAt;
    private long updatedAt;
}
