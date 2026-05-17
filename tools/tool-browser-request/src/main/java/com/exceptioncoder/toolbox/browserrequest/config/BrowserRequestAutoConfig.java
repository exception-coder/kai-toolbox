package com.exceptioncoder.toolbox.browserrequest.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(BrowserRequestProperties.class)
public class BrowserRequestAutoConfig {
}
