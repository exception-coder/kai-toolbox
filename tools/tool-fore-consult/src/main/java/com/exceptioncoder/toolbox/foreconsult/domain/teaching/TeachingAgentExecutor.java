package com.exceptioncoder.toolbox.foreconsult.domain.teaching;

/** 教学执行端口，隔离应用层与具体智能体 SDK。 */
public interface TeachingAgentExecutor {
    /** 执行已校验请求，返回成功或失败的运行证据。 */
    TeachingRun execute(TeachingConfig config, TeachingRequest request);

    /** 仅返回配置是否可用，不返回凭据。 */
    boolean liveAvailable();
}
