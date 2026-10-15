package com.exceptioncoder.toolbox.common.attachment;

import java.util.OptionalLong;

/** 业务模块可限定自己的会话附件，未接管的会话沿用宿主上限。 */
public interface SessionAttachmentPolicy {
    /** @return 当前会话单文件上限；空值表示此策略不负责该会话 */
    OptionalLong uploadLimit(String sessionId);
}
