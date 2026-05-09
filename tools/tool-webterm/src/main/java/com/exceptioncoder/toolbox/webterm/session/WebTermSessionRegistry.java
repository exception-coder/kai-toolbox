package com.exceptioncoder.toolbox.webterm.session;

import com.exceptioncoder.toolbox.webterm.config.WebTermProperties;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class WebTermSessionRegistry {

    private final WebTermProperties props;
    private final Map<String, WebTermSession> byId = new ConcurrentHashMap<>();
    private final Map<String, WebTermSession> byWs = new ConcurrentHashMap<>();

    public WebTermSessionRegistry(WebTermProperties props) {
        this.props = props;
    }

    /** 当前并发数是否还有空位 */
    public boolean hasFreeSlot() {
        return byId.size() < props.getMaxSessions();
    }

    public void register(WebSocketSession ws, WebTermSession session) {
        byId.put(session.getSessionId(), session);
        byWs.put(ws.getId(), session);
    }

    public WebTermSession findByWs(WebSocketSession ws) {
        return byWs.get(ws.getId());
    }

    public void remove(WebSocketSession ws) {
        WebTermSession s = byWs.remove(ws.getId());
        if (s != null) {
            byId.remove(s.getSessionId());
        }
    }

    @PreDestroy
    public void closeAll() {
        log.info("[webterm] shutting down, closing {} sessions", byId.size());
        byId.values().forEach(WebTermSession::close);
        byId.clear();
        byWs.clear();
    }
}
