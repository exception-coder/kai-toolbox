package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView;

/** 自动监督状态替换快照与跨会话看板修订提示。 */
public record SessionAutopilotChangedEvent(String sessionId, long revision,
                                           SessionAutopilotView.Run snapshot) {
}
