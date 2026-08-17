package com.regentech_fashion.wyoooni.enterprise.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Wyoooni 公司统一业务网关配置。 */
@ConfigurationProperties(prefix = "regentech.wyoooni.enterprise")
@Getter
@Setter
public class WyoooniEnterpriseProperties {
    private boolean enabled;
    private String baseUrl = "";
    private String serviceToken = "";
    private String accountVerificationPath = "/api/wyoooni/account-verifications";
    private int connectTimeoutMillis = 3000;
    private int requestTimeoutMillis = 10000;
}
