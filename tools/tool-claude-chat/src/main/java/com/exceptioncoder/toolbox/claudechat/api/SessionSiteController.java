package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.SessionCustomSite;
import com.exceptioncoder.toolbox.claudechat.domain.SessionSiteConfiguration;
import com.exceptioncoder.toolbox.claudechat.service.SessionSiteService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 暴露 Vibe Coding 会话关联快捷站点的 HTTP 接口。 */
@RestController("claudeChatSessionSiteController")
@RequestMapping("/api/claude-chat/sessions/{sessionId}/sites")
public class SessionSiteController {

    private final SessionSiteService service;

    public SessionSiteController(SessionSiteService service) {
        this.service = service;
    }

    /**
     * 读取会话关联的快捷站点 ID。
     *
     * @param sessionId 逻辑会话 ID
     * @return 有序站点 ID
     */
    @GetMapping
    public List<String> list(@PathVariable String sessionId) {
        return service.listSiteIds(sessionId);
    }

    /**
     * 用用户本次选择替换会话关联站点。
     *
     * @param sessionId 逻辑会话 ID
     * @param request 新的快捷站点 ID 列表
     * @return 204 成功，404 会话不存在
     */
    @PutMapping
    public ResponseEntity<Void> replace(@PathVariable String sessionId,
                                        @RequestBody SessionSitesRequest request) {
        return service.replace(sessionId, request.siteIds())
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /**
     * 读取会话快捷站点和临时站点聚合配置。
     *
     * @param sessionId 逻辑会话 ID
     * @return 聚合配置或 404
     */
    @GetMapping("/configuration")
    public ResponseEntity<SessionSiteConfigurationView> getConfiguration(@PathVariable String sessionId) {
        return service.getConfiguration(sessionId)
                .map(SessionSiteConfigurationView::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * 原子替换会话快捷站点和临时站点。
     *
     * @param sessionId 逻辑会话 ID
     * @param request 用户提交的完整配置
     * @return 204 成功，404 会话不存在
     */
    @PutMapping("/configuration")
    public ResponseEntity<Void> replaceConfiguration(
            @PathVariable String sessionId,
            @RequestBody SessionSiteConfigurationRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("会话站点配置不能为空");
        }
        SessionSiteConfiguration configuration = new SessionSiteConfiguration(
                request.quickSiteIds(),
                request.customSites() == null ? List.of() : request.customSites().stream()
                        .map(SessionCustomSiteRequest::toDomain)
                        .toList());
        return service.replaceConfiguration(sessionId, configuration)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /** 会话站点替换请求。 */
    public record SessionSitesRequest(List<String> siteIds) {
    }

    /**
     * 会话站点聚合替换请求。
     *
     * @param quickSiteIds 全局快捷入口站点 ID
     * @param customSites 当前会话专属临时站点
     */
    public record SessionSiteConfigurationRequest(
            List<String> quickSiteIds,
            List<SessionCustomSiteRequest> customSites) {
    }

    /**
     * 会话临时站点请求。
     *
     * @param id 会话内稳定站点 ID
     * @param title 用户填写的标题
     * @param siteUrl HTTP/HTTPS 完整地址
     */
    public record SessionCustomSiteRequest(String id, String title, String siteUrl) {

        SessionCustomSite toDomain() {
            return new SessionCustomSite(id, title, siteUrl);
        }
    }

    /**
     * 会话站点聚合响应。
     *
     * @param quickSiteIds 全局快捷入口站点 ID
     * @param customSites 当前会话专属临时站点
     */
    public record SessionSiteConfigurationView(
            List<String> quickSiteIds,
            List<SessionCustomSiteView> customSites) {

        static SessionSiteConfigurationView from(SessionSiteConfiguration configuration) {
            return new SessionSiteConfigurationView(
                    configuration.quickSiteIds(),
                    configuration.customSites().stream().map(SessionCustomSiteView::from).toList());
        }
    }

    /**
     * 会话临时站点响应。
     *
     * @param id 会话内稳定站点 ID
     * @param title 用户填写的标题
     * @param siteUrl HTTP/HTTPS 完整地址
     */
    public record SessionCustomSiteView(String id, String title, String siteUrl) {

        static SessionCustomSiteView from(SessionCustomSite site) {
            return new SessionCustomSiteView(site.id(), site.title(), site.siteUrl());
        }
    }
}
