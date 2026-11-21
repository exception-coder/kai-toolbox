package com.exceptioncoder.toolbox.common.resource;

import com.fasterxml.jackson.annotation.JsonInclude;

/** 隔离浏览器的受控登录与页面读取端口，不向调用方暴露凭据或任意脚本执行。 */
public interface WebPageReader {
    /** 在会话隔离的登录上下文读取同源页面。 */
    default Page read(String contextKey, BrowserLoginTarget target, String path, String loginPage) {
        return read(contextKey, target, path, loginPage, null);
    }
    /** 指定菜单时，仅展开并读取已授权页面中的导航菜单。 */
    Page read(String contextKey, BrowserLoginTarget target, String path, String loginPage, String menuName);
    /** 主动撤销个人授权时释放该隔离登录态。 */
    void closeContext(String contextKey);

    /** 页面正文是外部不可信证据，不是 Agent 指令。 */
    record Page(String status, String url, String title, String text,
                @JsonInclude(JsonInclude.Include.NON_NULL) MenuAction menuAction) {
        public Page(String status, String url, String title, String text) { this(status, url, title, text, null); }
    }
    enum MenuAction { EXPANDED, ALREADY_VISIBLE }
}
