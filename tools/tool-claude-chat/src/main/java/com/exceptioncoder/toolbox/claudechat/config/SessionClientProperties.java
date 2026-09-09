package com.exceptioncoder.toolbox.claudechat.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** Session Client 公共入口的网络边界配置。 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "toolbox.claude-chat.session-client")
public class SessionClientProperties {

    /** 是否开放公共 REST/WS 入口。 */
    private boolean enabled = true;

    /** 允许跨域调用公共 Client 的完整 Origin；空列表只允许同源。 */
    private List<String> allowedOrigins = new ArrayList<>();

    public void setAllowedOrigins(List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins == null
                ? new ArrayList<>()
                : allowedOrigins.stream().filter(origin -> origin != null && !origin.isBlank()).toList();
    }

}
