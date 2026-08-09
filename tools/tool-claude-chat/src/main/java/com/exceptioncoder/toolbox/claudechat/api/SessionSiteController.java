package com.exceptioncoder.toolbox.claudechat.api;

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

    /** 会话站点替换请求。 */
    public record SessionSitesRequest(List<String> siteIds) {
    }
}
