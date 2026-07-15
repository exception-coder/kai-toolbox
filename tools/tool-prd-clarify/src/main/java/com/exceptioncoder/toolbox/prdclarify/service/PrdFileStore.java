package com.exceptioncoder.toolbox.prdclarify.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/**
 * PRD Markdown 文件的落盘读写。
 * 默认存储目录：{@code ~/.kai-toolbox/prd/}，每个会话一个 {@code {id}.md} 文件。
 */
@Component
public class PrdFileStore {

    private static final Logger log = LoggerFactory.getLogger(PrdFileStore.class);

    private final Path baseDir;

    public PrdFileStore() {
        this.baseDir = Path.of(System.getProperty("user.home"), ".kai-toolbox", "prd");
    }

    @PostConstruct
    public void init() throws IOException {
        Files.createDirectories(baseDir);
        log.info("[prd-clarify] PRD 文件目录：{}", baseDir);
    }

    /** 获取指定会话的 .md 文件绝对路径（文件不一定存在）。 */
    public Path pathFor(String sessionId) {
        return baseDir.resolve(sessionId + ".md");
    }

    /** 将内容写入文件（覆盖）。 */
    public void write(String sessionId, String content) throws IOException {
        Path path = pathFor(sessionId);
        Files.writeString(path, content, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }

    /** 读取文件内容；文件不存在时返回空字符串。 */
    public String read(String sessionId) throws IOException {
        Path path = pathFor(sessionId);
        if (!Files.exists(path)) {
            return "";
        }
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    /** 删除文件；不存在时静默忽略。 */
    public void delete(String sessionId) throws IOException {
        Files.deleteIfExists(pathFor(sessionId));
    }
}
