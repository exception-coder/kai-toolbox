package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Path;

/** 流式汇总图谱，不为初始化摘要保留整份节点和关系树。 */
final class RegistryGraphSummary {
    static final long MAX_GRAPH_BYTES = 512L * 1024 * 1024;
    record Summary(int nodes, boolean relationships, int missingSources, int unresolvedLinks) { }
    private record Coverage(int missingSources, int unresolvedLinks) { }

    static Summary read(ObjectMapper json, Path file) throws IOException {
        int nodes = 0;
        Coverage coverage = new Coverage(0, 0);
        boolean relationships = false;
        try (JsonParser parser = json.getFactory().createParser(file.toFile())) {
            if (parser.nextToken() != JsonToken.START_OBJECT) { throw new IOException("图谱根节点无效"); }
            while (parser.nextToken() != JsonToken.END_OBJECT) {
                if (parser.currentToken() == null) { throw new IOException("图谱不完整"); }
                String field = parser.currentName();
                JsonToken value = parser.nextToken();
                if ("nodes".equals(field) && value == JsonToken.START_ARRAY) {
                    nodes = countArray(parser);
                } else if (("links".equals(field) || "edges".equals(field)) && value == JsonToken.START_ARRAY) {
                    relationships = true;
                    parser.skipChildren();
                } else if ("forgeCoverage".equals(field) && value == JsonToken.START_OBJECT) {
                    coverage = countCoverage(parser);
                } else { parser.skipChildren(); }
            }
            if (parser.nextToken() != null) { throw new IOException("图谱存在额外内容"); }
        }
        return new Summary(nodes, relationships, coverage.missingSources(), coverage.unresolvedLinks());
    }

    private static int countArray(JsonParser parser) throws IOException {
        int count = 0;
        while (parser.nextToken() != JsonToken.END_ARRAY) {
            if (parser.currentToken() == null) { throw new IOException("图谱数组不完整"); }
            parser.skipChildren();
            count++;
        }
        return count;
    }

    private static Coverage countCoverage(JsonParser parser) throws IOException {
        int missing = 0;
        int unresolved = 0;
        while (parser.nextToken() != JsonToken.END_OBJECT) {
            if (parser.currentToken() == null) { throw new IOException("覆盖信息不完整"); }
            String field = parser.currentName();
            JsonToken value = parser.nextToken();
            if ("missingSources".equals(field) || "unresolvedLinks".equals(field)) {
                if (value != JsonToken.START_ARRAY) { throw new IOException("覆盖缺口格式无效"); }
                int count = countArray(parser);
                if ("missingSources".equals(field)) { missing = count; } else { unresolved = count; }
            } else { parser.skipChildren(); }
        }
        return new Coverage(missing, unresolved);
    }
}
