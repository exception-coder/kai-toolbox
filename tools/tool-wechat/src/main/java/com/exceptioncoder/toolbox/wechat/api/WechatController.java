package com.exceptioncoder.toolbox.wechat.api;

import com.exceptioncoder.toolbox.wechat.api.dto.ChatListItem;
import com.exceptioncoder.toolbox.wechat.api.dto.ChatSummary;
import com.exceptioncoder.toolbox.wechat.api.dto.StoredMessage;
import com.exceptioncoder.toolbox.wechat.api.dto.WxMessage;
import com.exceptioncoder.toolbox.wechat.repository.WechatMessageRepository;
import com.exceptioncoder.toolbox.wechat.service.WechatMonitorService;
import com.exceptioncoder.toolbox.wechat.service.WechatSidecarClient;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/wechat")
public class WechatController {

    private final WechatSidecarClient sidecar;
    private final WechatMonitorService monitor;
    private final WechatMessageRepository repo;

    public WechatController(WechatSidecarClient sidecar, WechatMonitorService monitor,
                            WechatMessageRepository repo) {
        this.sidecar = sidecar;
        this.monitor = monitor;
        this.repo = repo;
    }

    /** sidecar 能力上报：是否安装库、微信是否登录、监听了哪些会话。前端进页面先打这个。 */
    @GetMapping("/health")
    public JsonNode health() {
        return sidecar.health();
    }

    /** 实时会话列表（直连 sidecar）。sidecar 不可用时回空数组。 */
    @GetMapping("/sessions")
    public List<ChatSummary> sessions() {
        return sidecar.sessions();
    }

    /** 数据库里最近活跃的会话（带末条消息预览，人在外面、sidecar 临时连不上时也能看历史）。 */
    @GetMapping("/chats")
    public List<ChatListItem> chats(@RequestParam(defaultValue = "50") int limit) {
        return repo.recentChats(clamp(limit, 1, 200));
    }

    /** 实时拉取某会话当前可见消息（直连 sidecar），同时不落库——落库走监听轮询。 */
    @GetMapping("/messages/live")
    public List<WxMessage> liveMessages(@RequestParam String who,
                                        @RequestParam(defaultValue = "0") int count) {
        return sidecar.messages(who, count);
    }

    /** 数据库里某会话的历史消息（监听落库的）。 */
    @GetMapping("/messages")
    public List<StoredMessage> messages(@RequestParam String chat,
                                        @RequestParam(defaultValue = "200") int limit) {
        return repo.listByChat(chat, clamp(limit, 1, 1000));
    }

    /** 全文检索落库消息。 */
    @GetMapping("/search")
    public List<StoredMessage> search(@RequestParam String q,
                                      @RequestParam(defaultValue = "100") int limit) {
        if (q == null || q.isBlank()) return List.of();
        return repo.search(q.trim(), clamp(limit, 1, 500));
    }

    /** 实时消息流（SSE，多端可同时订阅）：事件 ready / message。 */
    @GetMapping("/stream")
    public SseEmitter stream() {
        return monitor.subscribe();
    }

    /** 发送文字消息。 */
    @PostMapping("/send")
    public ResponseEntity<?> send(@RequestBody SendRequest req) {
        if (req == null || isBlank(req.who()) || isBlank(req.text())) {
            return ResponseEntity.badRequest().body(Map.of("error", "who 和 text 必填"));
        }
        try {
            sidecar.send(req.who(), req.text());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (WechatSidecarClient.SidecarException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", e.getMessage()));
        }
    }

    /** 登记监听一个会话（之后它的新消息会被落库 + 实时推送）。 */
    @PostMapping("/listen")
    public ResponseEntity<?> listen(@RequestBody ListenRequest req) {
        if (req == null || isBlank(req.who())) {
            return ResponseEntity.badRequest().body(Map.of("error", "who 必填"));
        }
        try {
            sidecar.listenAdd(req.who());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (WechatSidecarClient.SidecarException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/listen")
    public ResponseEntity<?> unlisten(@RequestParam String who) {
        if (isBlank(who)) {
            return ResponseEntity.badRequest().body(Map.of("error", "who 必填"));
        }
        try {
            sidecar.listenRemove(who);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (WechatSidecarClient.SidecarException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", e.getMessage()));
        }
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    public record SendRequest(String who, String text) {
    }

    public record ListenRequest(String who) {
    }
}
