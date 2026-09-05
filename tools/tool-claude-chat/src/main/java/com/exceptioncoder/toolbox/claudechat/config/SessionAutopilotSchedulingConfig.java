package com.exceptioncoder.toolbox.claudechat.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 仅为 claude-chat 活动自动监督运行启用低频恢复巡检。 */
@Configuration
@EnableScheduling
public class SessionAutopilotSchedulingConfig {
}
