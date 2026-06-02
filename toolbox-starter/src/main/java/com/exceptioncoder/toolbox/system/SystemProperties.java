package com.exceptioncoder.toolbox.system;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 绑定 {@code toolbox.system.*}：系统级运维配置。 */
@ConfigurationProperties(prefix = "toolbox.system")
public class SystemProperties {

    /** 远程重启端点 token；空字符串 = 端点关闭（公网 tunnel 下默认不开放）。 */
    private String restartToken = "";

    public String getRestartToken() {
        return restartToken;
    }

    public void setRestartToken(String restartToken) {
        this.restartToken = restartToken == null ? "" : restartToken;
    }
}
