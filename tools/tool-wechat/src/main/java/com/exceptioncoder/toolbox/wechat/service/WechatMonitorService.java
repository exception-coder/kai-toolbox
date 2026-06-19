package com.exceptioncoder.toolbox.wechat.service;

import com.exceptioncoder.toolbox.wechat.api.dto.StoredMessage;
import com.exceptioncoder.toolbox.wechat.api.dto.WxMessage;
import com.exceptioncoder.toolbox.wechat.config.WechatProperties;
import com.exceptioncoder.toolbox.wechat.repository.WechatMessageRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 微信监听的常驻心脏：后台虚拟线程定时 drain sidecar 的新消息 → 落库（去重）→ 广播给所有
 * 连着的浏览器标签。
 *
 * 为什么自己维护订阅列表而不用 SseEmitterRegistry：Registry 是「按 taskId 一对一」语义，
 * 而这里是「一份实时消息流，多端同时订阅」——多个标签/手机都要收同一条新消息，所以用
 * {@link CopyOnWriteArrayList} 做广播。即使没有任何前端连着，轮询照常落库，保证人不在时
 * 的消息也被归档（这正是「在外面翻 PC 微信历史」的关键）。
 */
@Service
public class WechatMonitorService {

    private static final Logger log = LoggerFactory.getLogger(WechatMonitorService.class);

    private final WechatProperties props;
    private final WechatSidecarClient sidecar;
    private final WechatMessageRepository repo;

    private final CopyOnWriteArrayList<SseEmitter> subscribers = new CopyOnWriteArrayList<>();
    private volatile boolean running = false;
    private Thread worker;

    public WechatMonitorService(WechatProperties props, WechatSidecarClient sidecar,
                                WechatMessageRepository repo) {
        this.props = props;
        this.sidecar = sidecar;
        this.repo = repo;
    }

    @PostConstruct
    public void start() {
        running = true;
        worker = Thread.ofVirtual().name("wechat-monitor").start(this::loop);
        log.info("[wechat] 监听轮询已启动，间隔 {}ms", props.getPollIntervalMs());
    }

    @PreDestroy
    public void stop() {
        running = false;
        if (worker != null) {
            worker.interrupt();
        }
        for (SseEmitter e : subscribers) {
            try { e.complete(); } catch (Exception ignored) { /* already done */ }
        }
        subscribers.clear();
    }

    /** 新建一个订阅（浏览器/手机的实时消息流）。1 小时超时，断开自动摘除。 */
    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(60L * 60L * 1000L);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> { subscribers.remove(emitter); emitter.complete(); });
        emitter.onError(ex -> subscribers.remove(emitter));
        subscribers.add(emitter);
        try {
            emitter.send(SseEmitter.event().name("ready").data("connected"));
        } catch (IOException e) {
            subscribers.remove(emitter);
        }
        return emitter;
    }

    /** sidecar 离线时轮询退避上限：连不上就别每 2s 试，最多拉到这个间隔。 */
    private static final long OFFLINE_MAX_INTERVAL_MS = 30_000;

    private void loop() {
        long base = props.getPollIntervalMs();
        long interval = base;
        boolean online = true; // 初始假定在线，首次连不上即打一条 INFO
        while (running) {
            try {
                drainOnce();
                interval = base;
                if (!online) {
                    log.info("[wechat] sidecar 已上线，恢复 {}ms 轮询", base);
                    online = true;
                }
            } catch (WechatSidecarClient.SidecarOfflineException offline) {
                // 连不上：指数退避，只在「在线→离线」翻转时打一条日志，不每轮刷
                if (online) {
                    log.info("[wechat] sidecar 未连接，轮询退避至最多 {}ms（启动 python-services/wechat/start.bat 后自动恢复）",
                            OFFLINE_MAX_INTERVAL_MS);
                    online = false;
                }
                interval = Math.min(interval * 2, OFFLINE_MAX_INTERVAL_MS);
            } catch (Exception e) {
                log.debug("[wechat] 轮询一轮失败（忽略，继续）: {}", e.toString());
            }
            try {
                Thread.sleep(interval);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void drainOnce() {
        List<WxMessage> fresh = sidecar.poll();
        if (fresh.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        for (WxMessage m : fresh) {
            boolean inserted = repo.insertIfAbsent(
                    m.chat(), m.sender(), m.content(), m.type(), m.time(), m.msgId(), now);
            if (inserted) {
                broadcast(m);
            }
        }
    }

    private void broadcast(WxMessage m) {
        StoredMessage view = new StoredMessage(
                0, m.chat(), m.sender(), m.content(), m.type(), m.time(), m.msgId(),
                System.currentTimeMillis());
        for (SseEmitter emitter : subscribers) {
            try {
                emitter.send(SseEmitter.event().name("message").data(view));
            } catch (Exception e) {
                subscribers.remove(emitter);
                try { emitter.completeWithError(e); } catch (Exception ignored) { /* done */ }
            }
        }
    }
}
