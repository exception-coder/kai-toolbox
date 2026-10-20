package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** 显式传入只读样本时验证真实会话，默认测试不依赖个人文件。 */
@EnabledIfSystemProperty(named = "history.performance.path", matches = ".+")
class CodexHistoryPerformanceTest {
    @Test
    void measuresColdPageHotPageAndSharedUsage() throws Exception {
        Path path = Path.of(System.getProperty("history.performance.path"));
        long size = Files.size(path);
        var modified = Files.getLastModifiedTime(path);
        ObjectMapper mapper = new ObjectMapper();
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        CodexHistoryTailReader tail = new CodexHistoryTailReader(mapper);
        long start = System.nanoTime();
        var cold = tail.page(path, null, 30);
        double coldMs = elapsedMs(start);
        start = System.nanoTime();
        var hot = new CodexHistoryTailReader(mapper).page(path, cold.nextCursor(), 30);
        double hotMs = elapsedMs(start);
        start = System.nanoTime();
        var usage = reader.usage(path);
        double usageMs = elapsedMs(start);
        long records = reader.scannedRecords(path);
        var expected = reader.page(path, null, null, cold.items().size() + hot.items().size());
        var combined = new java.util.ArrayList<>(hot.items());
        combined.addAll(cold.items());

        System.out.printf("CODEX_HISTORY_BENCH bytes=%d records=%d coldMs=%.3f hotMs=%.3f usageMs=%.3f pageBytes=%d%n",
                size, records, coldMs, hotMs, usageMs, mapper.writeValueAsBytes(cold).length);
        assertThat(cold.items()).isNotEmpty().hasSizeLessThanOrEqualTo(30);
        assertThat(hot.items()).isNotEmpty().hasSizeLessThanOrEqualTo(30);
        assertThat(coldMs).isLessThan(5_000);
        assertThat(hotMs).isLessThan(5_000);
        var actualItems = withoutIds(mapper, combined);
        var expectedItems = withoutIds(mapper, expected.items());
        assertThat(actualItems).hasSize(expectedItems.size());
        for (int index = 0; index < actualItems.size(); index++) {
            assertThat(actualItems.get(index).equals(expectedItems.get(index)))
                    .as("history item %d matches full reader (content omitted)", index).isTrue();
        }
        assertThat(Files.size(path)).isEqualTo(size);
        assertThat(Files.getLastModifiedTime(path)).isEqualTo(modified);
        System.out.println("CODEX_HISTORY_USAGE " + mapper.writeValueAsString(usage));

        String output = System.getProperty("history.performance.output");
        if (output != null) {
            Path outputPath = Path.of(output);
            Files.createDirectories(outputPath);
            Files.writeString(outputPath.resolve("indexed-page.json"), mapper.writeValueAsString(cold));
            Files.writeString(outputPath.resolve("indexed-usage.json"), mapper.writeValueAsString(usage));
        }
    }

    private double elapsedMs(long start) {
        return (System.nanoTime() - start) / 1_000_000.0;
    }

    private java.util.List<com.fasterxml.jackson.databind.JsonNode> withoutIds(ObjectMapper mapper,
            java.util.List<com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView> items) {
        return items.stream().map(item -> {
            var node = mapper.<com.fasterxml.jackson.databind.node.ObjectNode>valueToTree(item);
            node.remove("id");
            return (com.fasterxml.jackson.databind.JsonNode) node;
        }).toList();
    }
}
