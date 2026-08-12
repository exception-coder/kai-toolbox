package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * 当前 Vibe Coding 会话专属的临时测试站点。
 *
 * @param id 会话内稳定站点 ID
 * @param title 用户填写的站点标题
 * @param siteUrl 包含具体路径的 HTTP/HTTPS 地址
 */
public record SessionCustomSite(String id, String title, String siteUrl) {
}
