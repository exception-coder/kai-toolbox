package com.exceptioncoder.toolbox.mediaparser.config;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlaywrightManagerTest {

    @Test
    void defersInitializationAndCachesFailure() {
        MediaParserProperties properties = new MediaParserProperties();
        AtomicInteger attempts = new AtomicInteger();
        PlaywrightManager manager = new PlaywrightManager(
                properties,
                new ProxyConfig(properties),
                () -> {
                    attempts.incrementAndGet();
                    throw new RuntimeException("browser download unavailable");
                });

        try {
            assertThat(attempts).hasValue(0);

            assertThatThrownBy(() -> manager.withPage(page -> null))
                    .hasMessageContaining("Playwright 不可用");
            assertThatThrownBy(() -> manager.withPage(page -> null))
                    .hasMessageContaining("browser download unavailable");

            assertThat(attempts).hasValue(1);
        } finally {
            manager.shutdown();
        }
    }

    @Test
    void keepsInitializationFailureMessageBounded() {
        MediaParserProperties properties = new MediaParserProperties();
        String longMessage = "download failed " + "x".repeat(500) + System.lineSeparator() + "response body";
        PlaywrightManager manager = new PlaywrightManager(
                properties,
                new ProxyConfig(properties),
                () -> {
                    throw new RuntimeException(longMessage);
                });

        try {
            assertThatThrownBy(() -> manager.withPage(page -> null))
                    .hasMessageMatching("Playwright 不可用: .{240}\\.\\.\\.");
        } finally {
            manager.shutdown();
        }
    }
}
