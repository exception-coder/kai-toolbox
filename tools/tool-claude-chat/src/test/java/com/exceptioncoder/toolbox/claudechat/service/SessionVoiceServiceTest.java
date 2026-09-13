package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.VoiceOffer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class SessionVoiceServiceTest {
    private final SidecarClient sidecar = mock(SidecarClient.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final SessionVoiceService service = new SessionVoiceService(sidecar, mapper);
    private final VoiceOffer offer = new VoiceOffer("call-1", "v=0\r\n");
    private final SessionVoiceService.Eligibility code =
            new SessionVoiceService.Eligibility("codex", "standard", null, false);

    @Test
    void bindsOnlyOfficialCodeAndRejectsInvalidOffers() {
        assertThatThrownBy(() -> SessionVoiceService.validate(
                new SessionVoiceService.Eligibility("claude", "standard", null, false), offer))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SessionVoiceService.validate(
                new SessionVoiceService.Eligibility("codex", "consult-readonly", null, false), offer))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SessionVoiceService.validate(
                new SessionVoiceService.Eligibility("codex", "standard", "https://gateway", false), offer))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SessionVoiceService.validate(code, new VoiceOffer("call-1", "invalid")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SessionVoiceService.validate(code, new VoiceOffer("call-1", "v=0" + "x".repeat(64000))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void controlsRequireOwnerAndCurrentCallAndDisconnectDoesNotInterruptCode() {
        WebSocketSession owner = socket();
        when(sidecar.prepareVoice("session-1", offer)).thenReturn(true);
        when(sidecar.controlVoice(anyString(), anyString(), anyString())).thenReturn(true);
        service.bind(owner, "session-1", code, offer);
        service.control(socket(), new ClientMessage.VoiceControl("session-1", "call-1", "stop"));
        service.control(owner, new ClientMessage.VoiceControl("session-1", "stale", "stop"));
        verify(sidecar, never()).controlVoice(anyString(), anyString(), anyString());
        service.control(owner, new ClientMessage.VoiceControl("session-1", "call-1", "heartbeat"));
        verify(sidecar).controlVoice("session-1", "call-1", "heartbeat");
        service.disconnect(owner);
        verify(sidecar).controlVoice("session-1", "call-1", "stop");
        verify(sidecar, never()).interrupt(anyString());
        service.disconnect(owner);
        verify(sidecar, times(1)).controlVoice("session-1", "call-1", "stop");
    }

    @Test
    void forwardsEphemeralSdpOnlyToOwnerAndDropsOldCallEvents() throws Exception {
        WebSocketSession owner = socket();
        when(sidecar.prepareVoice("session-1", offer)).thenReturn(true);
        service.bind(owner, "session-1", code, offer);
        assertThat(service.observe("session-1", mapper.readTree(
                "{\"type\":\"voiceEvent\",\"event\":\"sdp\",\"callId\":\"old\",\"sdp\":\"private\"}"))).isTrue();
        verify(owner, never()).sendMessage(any());
        service.observe("session-1", mapper.readTree(
                "{\"type\":\"voiceEvent\",\"event\":\"sdp\",\"callId\":\"call-1\",\"sdp\":\"answer\"}"));
        verify(owner).sendMessage(any(TextMessage.class));
        assertThat(service.observe("session-1", mapper.readTree("{\"type\":\"result\"}"))).isFalse();
        verify(owner, times(2)).sendMessage(any(TextMessage.class));
    }

    @Test
    void failedDispatchDoesNotLeaveBindingAndOldSendPayloadStillDeserializes() throws Exception {
        WebSocketSession owner = socket();
        assertThatThrownBy(() -> service.bind(owner, "session-1", code, offer))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("未送达");
        when(sidecar.prepareVoice("session-1", offer)).thenReturn(true);
        service.bind(owner, "session-1", code, offer);
        var oldSend = (ClientMessage.Send) mapper.readValue(
                "{\"type\":\"send\",\"text\":\"hello\"}", ClientMessage.class);
        assertThat(oldSend.voice()).isNull();
    }

    private WebSocketSession socket() {
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.isOpen()).thenReturn(true);
        return socket;
    }
}
