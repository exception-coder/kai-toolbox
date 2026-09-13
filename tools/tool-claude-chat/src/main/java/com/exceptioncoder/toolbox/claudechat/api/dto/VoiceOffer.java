package com.exceptioncoder.toolbox.claudechat.api.dto;

/** 瞬时 WebRTC 协商数据，不进入会话历史或日志。 */
public record VoiceOffer(
        /** 客户端本次通话的唯一标识。 */ String callId,
        /** 浏览器生成的音频 SDP offer。 */ String sdp) {
}
