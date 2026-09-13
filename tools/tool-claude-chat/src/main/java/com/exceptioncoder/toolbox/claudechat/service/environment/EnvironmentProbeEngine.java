package com.exceptioncoder.toolbox.claudechat.service.environment;

import java.util.List;

/** 本机版本命令探测端口；实现不得改变共享版本判定规则。 */
public interface EnvironmentProbeEngine {
    /** @return 稳定实现标识 java 或 go */
    String id();

    /** @param path 本次请求固定 PATH 快照 @return 固定命令集合的执行结果 */
    List<EnvironmentProbeResult> inspect(String path);
}
