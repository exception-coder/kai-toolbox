package com.exceptioncoder.toolbox.webterm.session;

import com.exceptioncoder.toolbox.webterm.config.WebTermProperties;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

@Slf4j
@Component
public class WebTermSessionRegistry {

    private final WebTermProperties props;
    private final Map<String, WebTermSession> byId = new ConcurrentHashMap<>();
    private final Map<String, WebTermSession> byWs = new ConcurrentHashMap<>();

    /** detach 后的 idle 超时任务、attach 后的 ping 都用这个调度器。共享单例，daemon 线程。 */
    private final ScheduledExecutorService scheduler =
            Executors.newScheduledThreadPool(2, r -> {
                Thread t = new Thread(r, "webterm-session-timer");
                t.setDaemon(true);
                return t;
            });

    public WebTermSessionRegistry(WebTermProperties props) {
        this.props = props;
    }

    public ScheduledExecutorService scheduler() {
        return scheduler;
    }

    /** 当前已注册（含 detached）会话是否还有空位 */
    public boolean hasFreeSlot() {
        return byId.size() < props.getMaxSessions();
    }

    public void register(WebSocketSession ws, WebTermSession session) {
        byId.put(session.getSessionId(), session);
        byWs.put(ws.getId(), session);
    }

    /** 把 ws → session 的映射切到新 ws（旧 ws 自己已经断了由调用方处理）。 */
    public void rebindWs(WebSocketSession newWs, WebTermSession session) {
        byWs.put(newWs.getId(), session);
    }

    /** ws 断开但 session 继续保活时，从 byWs 摘掉绑定（byId 仍保留）。 */
    public void unbindWs(WebSocketSession ws) {
        byWs.remove(ws.getId());
    }

    public WebTermSession findByWs(WebSocketSession ws) {
        return byWs.get(ws.getId());
    }

    public WebTermSession findById(String sessionId) {
        if (sessionId == null) return null;
        return byId.get(sessionId);
    }

    public Optional<WebTermSession> findLiveBy(String cwd, String shell) {
        if (cwd == null || shell == null) return Optional.empty();
        return byId.values().stream()
                .filter(s -> !s.isExited())
                .filter(s -> Objects.equals(s.getCwd(), cwd) && Objects.equals(s.getShell(), shell))
                .findFirst();
    }

    public Collection<WebTermSession> listAll() {
        return new ArrayList<>(byId.values());
    }

    /** WebTermSession.close() 永久关闭后回调，从 byId / byWs 一并摘除。 */
    public void permanentRemove(String sessionId) {
        WebTermSession s = byId.remove(sessionId);
        if (s != null) {
            WebSocketSession ws = s.ws();
            if (ws != null) byWs.remove(ws.getId());
        }
    }

    @PreDestroy
    public void closeAll() {
        log.info("[webterm] shutting down, closing {} sessions", byId.size());
        // copy 出来避免 close() 回调 permanentRemove 时并发修改
        List<WebTermSession> snapshot = new ArrayList<>(byId.values());
        snapshot.forEach(WebTermSession::close);
        byId.clear();
        byWs.clear();
        scheduler.shutdownNow();
    }
}
