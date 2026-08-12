package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;

/**
 * 会话测试站点聚合配置，兼容全局快捷站点关联和会话临时站点。
 *
 * @param quickSiteIds 全局快捷入口站点 ID
 * @param customSites 当前会话专属临时站点
 */
public record SessionSiteConfiguration(List<String> quickSiteIds, List<SessionCustomSite> customSites) {
}
