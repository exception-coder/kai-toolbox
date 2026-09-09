package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 只消费 Graphify 原生节点，不重新构建图谱或将 community 当成业务域。 */
@Component
public class DomainGraphContext {
    private final ObjectMapper json;
    public DomainGraphContext(ObjectMapper json) { this.json = json; }

    public record Node(String id, String path, String label, String community) { }
    public record Index(Map<String, Node> nodes, List<Node> seeds, String fingerprint, int communities) { }

    public Index load(String root) {
        Path file = Path.of(root, "graphify-out", "graph.json");
        try {
            if (!Files.isRegularFile(file) || !file.toRealPath().startsWith(Path.of(root).toRealPath())) {
                throw new IllegalArgumentException("尚无可用 Graphify 图谱，请先完整初始化项目");
            }
            if (Files.size(file) > 128L * 1024 * 1024) {
                throw new IllegalArgumentException("图谱超过 128 MiB，请按项目边界拆分探索");
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            Map<String, Node> nodes = new LinkedHashMap<>();
            try (var input = new DigestInputStream(Files.newInputStream(file), digest);
                 JsonParser parser = json.getFactory().createParser(input)) {
                if (parser.nextToken() != JsonToken.START_OBJECT) { throw new IOException("图谱根节点无效"); }
                while (parser.nextToken() != JsonToken.END_OBJECT) {
                    if (parser.currentToken() == null) { throw new IOException("图谱不完整"); }
                    String field = parser.currentName();
                    parser.nextToken();
                    if ("nodes".equals(field) && parser.currentToken() == JsonToken.START_ARRAY) {
                        while (parser.nextToken() != JsonToken.END_ARRAY) {
                            JsonNode node = json.readTree(parser);
                            if (node == null || nodes.size() >= 100000) { throw new IOException("图谱节点异常或超过 100000"); }
                            String id = node.path("id").asText("");
                            String path = node.path("source_file").asText("").replace('\\', '/');
                            if (!id.isBlank() && !path.isBlank()) {
                                nodes.put(id, new Node(id, path, node.path("label").asText(id),
                                        node.path("community").asText("unassigned")));
                            }
                        }
                    } else { parser.skipChildren(); }
                }
                while (input.read() != -1) { /* 指纹覆盖完整文件，包括尾部空白。 */ }
            }
            if (nodes.isEmpty()) { throw new IllegalArgumentException("Graphify 图谱没有可定位源码的节点，请重新初始化"); }
            Map<String, Integer> counts = new LinkedHashMap<>();
            Map<String, Integer> seedCounts = new LinkedHashMap<>();
            List<Node> seeds = new ArrayList<>();
            for (Node node : nodes.values()) {
                counts.merge(node.community(), 1, Integer::sum);
                if (implementationPath(node.path()) && seedCounts.merge(node.community(), 1, Integer::sum) <= 2
                        && seeds.size() < 100) { seeds.add(node); }
            }
            return new Index(Map.copyOf(nodes), List.copyOf(seeds), HexFormat.of().formatHex(digest.digest()), counts.size());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalArgumentException("无法读取 Graphify 图谱，请检查 graphify-out/graph.json", exception);
        }
    }

    static boolean implementationPath(String path) {
        return path.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(java|ts|tsx|js|jsx|vue|py|go|rs|cs|php|rb|dart|kt|kts|scala|c|cpp|h|hpp|jsp|html|xml|sql)$");
    }
}
