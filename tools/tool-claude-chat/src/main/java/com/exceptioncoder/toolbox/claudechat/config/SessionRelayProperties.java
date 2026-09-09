package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.DynamicConfigValidatable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 业务系统 Relay 身份配置，复用配置中心持久化和刷新。 */
@Getter
@Setter
@Component
@Refreshable(name = "Relay 接入客户端", group = "Vibe Coding")
@ConfigurationProperties(prefix = SessionRelayProperties.PREFIX)
public class SessionRelayProperties implements DynamicConfigValidatable {

    /** 与既有部署配置保持相同命名空间。 */
    public static final String PREFIX = "toolbox.claude-chat.session-client.relay";

    /** Relay 入口总开关。 */
    @ConfigDesc("开放业务系统 Relay 接入")
    private boolean enabled;

    /** 显式启用多客户端，空列表也不会回退部署凭据。 */
    private boolean managed;

    /** 兼容部署提供的客户端标识。 */
    private String clientId = "";

    /** 兼容部署提供的秘密。 */
    private String clientSecret = "";

    /** 各系统独立的客户端身份。 */
    private List<Client> clients = new ArrayList<>();

    @Override
    public void validateConfiguration() {
        if (clients == null || clients.size() > 100) {
            throw new IllegalArgumentException("Relay 客户端列表不能为空值且最多支持 100 个客户端");
        }
        Set<String> ids = new HashSet<>(clients.size() * 2 + 1);
        for (Client client : clients) {
            if (client == null || client.getClientId() == null
                    || !client.getClientId().matches("[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}")) {
                throw new IllegalArgumentException("Client ID 需为 1–64 位字母、数字、下划线或短横线");
            }
            if (!ids.add(client.getClientId())) {
                throw new IllegalArgumentException("Client ID 不允许重复");
            }
            if (client.getName() == null || client.getName().isBlank() || client.getName().length() > 100) {
                throw new IllegalArgumentException("客户端名称需为 1–100 个字符");
            }
            if (client.getClientSecret() == null || client.getClientSecret().isBlank()
                    || client.getClientSecret().length() > 512) {
                throw new IllegalArgumentException("每个客户端必须填写 Secret，最多 512 个字符");
            }
        }
    }

    /** 一个接入系统的服务端身份；不生成包含秘密的 toString。 */
    @Getter
    @Setter
    public static class Client {
        /** 稳定的审计标识。 */
        private String clientId = "";
        /** 管理员识别名称。 */
        private String name = "";
        /** 客户端独立开关。 */
        private boolean enabled = true;
        /** 服务端 Basic 认证秘密。 */
        private String clientSecret = "";
    }
}
