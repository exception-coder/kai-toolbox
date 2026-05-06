package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.config.MediaParserProperties;
import com.exceptioncoder.toolbox.mediaparser.config.ProxyConfig;
import com.exceptioncoder.toolbox.mediaparser.domain.Platform;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Fallback parser for Instagram using saveinst.app (SnapCDN pattern).
 * Activated only when YtDlpParser fails for Instagram URLs.
 */
@Component
@Order(10)
public class SaveInstParser extends SnapCdnParser {

    public SaveInstParser(MediaParserProperties props, ProxyConfig proxyConfig, ObjectMapper objectMapper) {
        super("https://saveinst.app", props, proxyConfig, objectMapper);
    }

    @Override
    public Set<Platform> supports() {
        return Set.of(Platform.INSTAGRAM);
    }
}
