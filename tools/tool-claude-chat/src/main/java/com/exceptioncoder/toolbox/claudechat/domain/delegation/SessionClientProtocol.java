package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.util.Set;

/** Session Client 公共协议版本和固定命令边界。 */
public final class SessionClientProtocol {

    /** 首个公共协议版本。 */
    public static final String VERSION = "1.0";

    /** 当前服务端接受的协议版本。 */
    public static final Set<String> SUPPORTED_VERSIONS = Set.of(VERSION);

    /** 所有委托画像共同允许的参与者命令。 */
    public static final Set<SessionParticipantCommand> PARTICIPANT_COMMANDS = Set.of(
            SessionParticipantCommand.ATTACH,
            SessionParticipantCommand.SEND,
            SessionParticipantCommand.ANSWER_QUESTION,
            SessionParticipantCommand.INTERRUPT_OWN_TURN,
            SessionParticipantCommand.ACKNOWLEDGE);

    private SessionClientProtocol() {
    }
}
