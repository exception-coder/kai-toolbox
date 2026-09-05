package com.exceptioncoder.forge.sessionrelay.web;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.ForgeRelayParticipantResolver;
import com.exceptioncoder.forge.sessionrelay.support.LocalConnectionTicketStore;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

/** 在升级协议前同时消费本地 ticket 并校验宿主 Principal。 */
public final class ForgeRelayHandshakeInterceptor implements HandshakeInterceptor {
    public static final String BINDING_ATTRIBUTE = "forgeRelayBinding";
    private final ForgeRelayParticipantResolver participants;
    private final LocalConnectionTicketStore tickets;

    public ForgeRelayHandshakeInterceptor(ForgeRelayParticipantResolver participants,
                                          LocalConnectionTicketStore tickets) {
        this.participants = participants;
        this.tickets = tickets;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler handler, Map<String, Object> attributes) {
        long subject = participants.resolve(request.getPrincipal(), request.getHeaders());
        String ticket = UriComponentsBuilder.fromUri(request.getURI()).build()
                .getQueryParams().getFirst("ticket");
        ForgeRelayBinding binding = tickets.consume(ticket, subject).orElse(null);
        if (binding == null) return false;
        attributes.put(BINDING_ATTRIBUTE, binding);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler handler, Exception exception) {
    }
}
