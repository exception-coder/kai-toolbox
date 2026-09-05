package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.util.Locale;
import java.util.Optional;

/** 公共 Session Client 可提交的有限命令集合。 */
public enum SessionParticipantCommand {
    /** 绑定并恢复授权会话。 */
    ATTACH,
    /** 向授权会话提交一条用户消息。 */
    SEND,
    /** 回答 Agent 发出的业务澄清问题。 */
    ANSWER_QUESTION,
    /** 中止当前参与者发起的活跃回合。 */
    INTERRUPT_OWN_TURN,
    /** 确认已处理到指定事件序号。 */
    ACKNOWLEDGE;

    /**
     * 将 wire command 转为白名单枚举。
     *
     * @param value 外部命令名
     * @return 受支持命令；未知命令返回空
     */
    public static Optional<SessionParticipantCommand> fromWire(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.replace('-', '_').toUpperCase(Locale.ROOT);
        try {
            return Optional.of(valueOf(normalized));
        } catch (IllegalArgumentException ignored) {
            return Optional.empty();
        }
    }
}
