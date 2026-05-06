package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.config.MediaParserProperties;
import com.exceptioncoder.toolbox.mediaparser.config.ProxyConfig;
import com.exceptioncoder.toolbox.mediaparser.domain.Platform;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Fallback parser for Facebook using fsaver.com (SnapCDN pattern).
 * Activated only when YtDlpParser fails for Facebook URLs.
 */
@Component
@Order(10)
public class FSaverParser extends SnapCdnParser {

    public FSaverParser(MediaParserProperties props, ProxyConfig proxyConfig, ObjectMapper objectMapper) {
        super("https://fsaver.com", props, proxyConfig, objectMapper);
    }

    @Override
    public Set<Platform> supports() {
        return Set.of(Platform.FACEBOOK);
    }
}
