package com.exceptioncoder.toolbox.claudechat.service.autopilot;

/** Sidecar 确认实际加载的 Continuous Execution Skill 能力证据。 */
public record SessionCapabilitiesObservedEvent(String sessionId, String skillPath,
                                               String skillVersion, String skillFingerprint) {
}
