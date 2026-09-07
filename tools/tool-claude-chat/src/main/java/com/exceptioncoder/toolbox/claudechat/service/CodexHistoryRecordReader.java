package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.core.io.JsonEOFException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;

import java.io.BufferedInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

/** 流式读取索引元数据，跳过页外工具正文和注入上下文。 */
@Slf4j
final class CodexHistoryRecordReader implements AutoCloseable {
    private static final Set<String> PAYLOAD_FIELDS = Set.of("type", "message", "call_id", "turn_id", "cwd", "role", "channel");
    private final ObjectMapper mapper;
    private final Path path;
    private final long size;
    private JsonParser parser;
    private long base;
    private long completedOffset;
    private boolean turnContextSeen;

    CodexHistoryRecordReader(ObjectMapper mapper, Path path, long start, long size, boolean turnContextSeen) throws IOException {
        this.mapper = mapper;
        this.path = path;
        this.size = size;
        this.turnContextSeen = turnContextSeen;
        this.completedOffset = start;
        open(start);
    }

    Record next() throws IOException {
        while (completedOffset < size) {
            long start = completedOffset;
            try {
                JsonToken token = parser.nextToken();
                if (token == null) {
                    completedOffset = size;
                    return null;
                }
                start = base + parser.currentTokenLocation().getByteOffset();
                ObjectNode node = mapper.createObjectNode();
                if (token == JsonToken.START_OBJECT) {
                    readRoot(node);
                    if ("task_started".equals(node.path("payload").path("type").asText())) {
                        turnContextSeen = false;
                    } else if ("turn_context".equals(node.path("type").asText())) {
                        turnContextSeen = true;
                    }
                } else {
                    parser.skipChildren();
                }
                completedOffset = base + parser.currentLocation().getByteOffset();
                return new Record(start, node);
            } catch (JsonEOFException incomplete) {
                return null;
            } catch (JsonProcessingException invalid) {
                long nextLine = nextLineAfter(start);
                if (nextLine < 0) {
                    return null;
                }
                log.debug("Skipping malformed Codex history record at {}:{}", path, start);
                completedOffset = nextLine;
                open(nextLine);
            }
        }
        return null;
    }

    private void readRoot(ObjectNode node) throws IOException {
        while (parser.nextToken() != JsonToken.END_OBJECT) {
            requireField();
            String field = parser.currentName();
            parser.nextToken();
            if ("payload".equals(field) && parser.currentToken() == JsonToken.START_OBJECT) {
                node.set(field, readPayload());
            } else if ("timestamp".equals(field) || "type".equals(field)) {
                node.set(field, mapper.readTree(parser));
            } else {
                parser.skipChildren();
            }
        }
    }

    private ObjectNode readPayload() throws IOException {
        ObjectNode payload = mapper.createObjectNode();
        while (parser.nextToken() != JsonToken.END_OBJECT) {
            requireField();
            String field = parser.currentName();
            parser.nextToken();
            if (PAYLOAD_FIELDS.contains(field)) {
                payload.set(field, mapper.readTree(parser));
            } else if (turnContextSeen && "content".equals(field) && parser.currentToken() == JsonToken.START_ARRAY) {
                payload.set(field, readContent());
            } else if ("info".equals(field) && parser.currentToken() == JsonToken.START_OBJECT) {
                payload.set(field, readUsage());
            } else {
                parser.skipChildren();
            }
        }
        return payload;
    }

    /** 保留消息文本，跳过图片数据及其他非文本内容。 */
    private com.fasterxml.jackson.databind.node.ArrayNode readContent() throws IOException {
        var content = mapper.createArrayNode();
        while (parser.nextToken() != JsonToken.END_ARRAY) {
            if (parser.currentToken() == null) {
                throw new JsonEOFException(parser, JsonToken.END_ARRAY, "Incomplete message content");
            }
            if (parser.currentToken() != JsonToken.START_OBJECT) {
                parser.skipChildren();
                continue;
            }
            ObjectNode block = mapper.createObjectNode();
            while (parser.nextToken() != JsonToken.END_OBJECT) {
                requireField();
                String field = parser.currentName();
                parser.nextToken();
                if (("type".equals(field) || "text".equals(field))
                        && parser.currentToken() == JsonToken.VALUE_STRING) {
                    block.put(field, parser.getText());
                } else {
                    parser.skipChildren();
                }
            }
            String type = block.path("type").asText();
            if ("input_text".equals(type) || "output_text".equals(type)) {
                content.add(block);
            }
        }
        return content;
    }

    private ObjectNode readUsage() throws IOException {
        ObjectNode info = mapper.createObjectNode();
        while (parser.nextToken() != JsonToken.END_OBJECT) {
            requireField();
            String field = parser.currentName();
            parser.nextToken();
            if ("last_token_usage".equals(field)) {
                info.set(field, mapper.readTree(parser));
            } else {
                parser.skipChildren();
            }
        }
        return info;
    }

    private void requireField() throws IOException {
        if (parser.currentToken() == null) {
            throw new JsonEOFException(parser, JsonToken.FIELD_NAME, "Incomplete history record");
        }
        if (parser.currentToken() != JsonToken.FIELD_NAME) {
            throw new com.fasterxml.jackson.core.JsonParseException(parser, "Expected history field");
        }
    }

    private long nextLineAfter(long offset) throws IOException {
        try (InputStream input = new BufferedInputStream(Files.newInputStream(path))) {
            input.skipNBytes(offset);
            for (long position = offset; position < size; position++) {
                int value = input.read();
                if (value < 0) {
                    return -1;
                }
                if (value == '\n') {
                    return position + 1;
                }
            }
            return -1;
        }
    }

    private void open(long offset) throws IOException {
        close();
        InputStream input = Files.newInputStream(path);
        try {
            input.skipNBytes(offset);
            parser = mapper.getFactory().createParser(new SnapshotInputStream(input, size - offset));
            base = offset;
        } catch (IOException error) {
            input.close();
            throw error;
        }
    }

    long completedOffset() {
        return completedOffset;
    }

    @Override
    public void close() throws IOException {
        if (parser != null) {
            parser.close();
        }
    }

    /** 完整记录的元数据与文件绝对字节位置。 */
    record Record(long offset, JsonNode node) { }

    /** 将当前读取限制在确定的快照长度内，不追逐持续追加的内容。 */
    private static final class SnapshotInputStream extends FilterInputStream {
        private long remaining;

        private SnapshotInputStream(InputStream input, long remaining) {
            super(input);
            this.remaining = remaining;
        }

        @Override
        public int read() throws IOException {
            if (remaining == 0) {
                return -1;
            }
            int value = in.read();
            if (value >= 0) {
                remaining--;
            }
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            if (length == 0) {
                return 0;
            }
            if (remaining == 0) {
                return -1;
            }
            int count = in.read(bytes, offset, (int) Math.min(length, remaining));
            if (count > 0) {
                remaining -= count;
            }
            return count;
        }
    }
}
