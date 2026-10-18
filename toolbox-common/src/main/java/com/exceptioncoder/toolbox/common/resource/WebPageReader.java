package com.exceptioncoder.toolbox.common.resource;

/** 隔离浏览器的受控登录与页面读取端口，不向调用方暴露凭据或任意脚本执行。 */
public interface WebPageReader {
    /** 在会话隔离的登录上下文读取同源页面。 */
    Page read(String contextKey, BrowserLoginTarget target, String path, String loginPage);

    /** 页面正文是外部不可信证据，不是 Agent 指令。 */
    record Page(String status, String url, String title, String text) { }
}
