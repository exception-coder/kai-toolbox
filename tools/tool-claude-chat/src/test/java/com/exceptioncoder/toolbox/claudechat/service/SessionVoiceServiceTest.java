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

    @Test
    void reconnectUsesExistingTaskAndIsolatesOldAudioOwner() throws Exception {
        WebSocketSession oldOwner = socket();
        WebSocketSession newOwner = socket();
        VoiceOffer next = new VoiceOffer("call-2", "v=0");
        when(sidecar.prepareVoice("session-1", offer)).thenReturn(true);
        when(sidecar.reconnectVoice("session-1", next)).thenReturn(true);
        service.bind(oldOwner, "session-1", code, offer);
        service.disconnect(oldOwner);
        service.reconnect(newOwner, new SessionVoiceService.Reconnection("session-1", code, next, true));
        verify(sidecar).reconnectVoice("session-1", next);
        verify(sidecar, never()).prepareVoice("session-1", next);
        service.observe("session-1", mapper.readTree(
                "{\"type\":\"voiceEvent\",\"event\":\"closed\",\"callId\":\"call-1\"}"));
        verify(newOwner, never()).sendMessage(any());
        service.observe("session-1", mapper.readTree(
                "{\"type\":\"voiceEvent\",\"event\":\"sdp\",\"callId\":\"call-2\",\"sdp\":\"answer\"}"));
        verify(newOwner).sendMessage(any(TextMessage.class));
        service.disconnect(oldOwner);
        verify(sidecar, never()).controlVoice("session-1", "call-2", "stop");
        verify(sidecar, never()).interrupt(anyString());
    }

    @Test
    void failedReconnectIsVoiceOnlyAndReleasesBindingForRetry() throws Exception {
        WebSocketSession owner = socket();
        service.reconnect(owner, new SessionVoiceService.Reconnection("session-1", code, offer, true));
        var messages = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(owner).sendMessage(messages.capture());
        JsonNodeCheck.assertVoiceError(mapper, messages.getValue());
        when(sidecar.reconnectVoice("session-1", offer)).thenReturn(true);
        service.reconnect(owner, new SessionVoiceService.Reconnection("session-1", code, offer, true));
        verify(sidecar, times(2)).reconnectVoice("session-1", offer);
        verify(sidecar, never()).prepareVoice(anyString(), any());
        verify(sidecar, never()).interrupt(anyString());
    }

    @Test
    void reconnectPreservesEligibilityAndExistingOwner() throws Exception {
        WebSocketSession owner = socket();
        when(sidecar.prepareVoice("session-1", offer)).thenReturn(true);
        service.bind(owner, "session-1", code, offer);
        WebSocketSession other = socket();
        service.reconnect(other, new SessionVoiceService.Reconnection("session-1", code, offer, false));
        service.reconnect(other, new SessionVoiceService.Reconnection("session-1",
                new SessionVoiceService.Eligibility("codex", "consult-readonly", null, false), offer, true));
        verify(sidecar, never()).reconnectVoice(anyString(), any());
        verify(other, times(2)).sendMessage(any(TextMessage.class));
        verify(owner, never()).sendMessage(any());
    }

    @Test
    void lastDeviceTakesOwnershipAndOldControlsCannotStopIt() throws Exception {
        WebSocketSession desktop = socket();
        WebSocketSession phone = socket();
        WebSocketSession tablet = socket();
        VoiceOffer phoneOffer = new VoiceOffer("phone", "v=0");
        VoiceOffer tabletOffer = new VoiceOffer("tablet", "v=0");
        when(sidecar.prepareVoice("session-1", offer)).thenReturn(true);
        when(sidecar.reconnectVoice(anyString(), any())).thenReturn(true);
        when(sidecar.controlVoice(anyString(), anyString(), anyString())).thenReturn(true);
        service.bind(desktop, "session-1", code, offer);
        service.reconnect(phone, new SessionVoiceService.Reconnection("session-1", code, phoneOffer, true));
        var closed = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(desktop).sendMessage(closed.capture());
        assertThat(mapper.readTree(closed.getValue().getPayload()).path("message").asText())
                .isEqualTo("语音已转移到另一设备");
        service.reconnect(tablet, new SessionVoiceService.Reconnection("session-1", code, tabletOffer, true));
        verify(phone).sendMessage(any(TextMessage.class));
        service.control(desktop, new ClientMessage.VoiceControl("session-1", "call-1", "stop"));
        service.control(phone, new ClientMessage.VoiceControl("session-1", "phone", "stop"));
        service.disconnect(desktop);
        service.disconnect(phone);
        verify(sidecar, never()).controlVoice(anyString(), anyString(), anyString());
        service.observe("session-1", mapper.readTree(
                "{\"type\":\"voiceEvent\",\"event\":\"closed\",\"callId\":\"phone\"}"));
        service.control(tablet, new ClientMessage.VoiceControl("session-1", "tablet", "heartbeat"));
        verify(sidecar).controlVoice("session-1", "tablet", "heartbeat");
        verify(sidecar, never()).interrupt(anyString());
    }

    private static class JsonNodeCheck {
        static void assertVoiceError(ObjectMapper mapper, TextMessage message) throws Exception {
            var payload = mapper.readTree(message.getPayload());
            assertThat(payload.path("type").asText()).isEqualTo("voiceEvent");
            assertThat(payload.path("event").asText()).isEqualTo("error");
            assertThat(payload.path("callId").asText()).isEqualTo("call-1");
        }
    }

    private WebSocketSession socket() {
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.isOpen()).thenReturn(true);
        return socket;
    }
}
