package com.exceptioncoder.toolbox.mediaparser.service;

import com.exceptioncoder.toolbox.mediaparser.domain.ParseResult;
import com.exceptioncoder.toolbox.mediaparser.domain.Platform;
import com.exceptioncoder.toolbox.mediaparser.parser.PlatformParser;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MediaParserService {

    // Ordered list of parsers per platform; first entry is tried first (primary), rest are fallbacks.
    // Spring injects List<PlatformParser> sorted by @Order, so primary parsers always come before fallbacks.
    private final Map<Platform, List<PlatformParser>> parserMap;

    public MediaParserService(List<PlatformParser> parsers) {
        parserMap = new EnumMap<>(Platform.class);
        for (PlatformParser parser : parsers) {
            for (Platform p : parser.supports()) {
                parserMap.computeIfAbsent(p, k -> new ArrayList<>()).add(parser);
            }
        }
    }

    /** 启动后把每个平台实际注册到的解析器链打出来，便于排查"为什么没走 fallback"。 */
    @PostConstruct
    public void logParserChains() {
        log.info("============== Media Parser 平台 → 解析器链 ==============");
        for (Platform p : Platform.values()) {
            if (p == Platform.UNKNOWN) continue;
            List<PlatformParser> chain = parserMap.get(p);
            if (chain == null || chain.isEmpty()) {
                log.info("  {} → (无解析器)", p);
            } else {
                String names = chain.stream()
                        .map(parser -> parser.getClass().getSimpleName())
                        .collect(Collectors.joining(" → "));
                log.info("  {} → {}", p, names);
            }
        }
        log.info("==========================================================");
    }

    public ParseResult parse(String url) {
        Platform platform = Platform.detect(url);
        List<PlatformParser> candidates = parserMap.get(platform);
        if (candidates == null || candidates.isEmpty()) {
            String supported = parserMap.keySet().stream()
                    .map(Platform::name)
                    .sorted()
                    .collect(Collectors.joining(", "));
            throw new IllegalArgumentException(
                    "不支持的平台: " + platform.name() + "。当前支持: " + supported);
        }

        RuntimeException lastError = null;
        for (int i = 0; i < candidates.size(); i++) {
            PlatformParser parser = candidates.get(i);
            boolean hasNext = i < candidates.size() - 1;
            try {
                return parser.parse(url);
            } catch (RuntimeException e) {
                if (hasNext) {
                    PlatformParser next = candidates.get(i + 1);
                    log.warn("Parser {} failed for platform {}, falling through to {}: {}",
                            parser.getClass().getSimpleName(), platform,
                            next.getClass().getSimpleName(), e.getMessage());
                } else {
                    log.warn("Parser {} failed for platform {} and no more fallbacks registered: {}",
                            parser.getClass().getSimpleName(), platform, e.getMessage());
                }
                lastError = e;
            }
        }
        throw lastError;
    }
}
