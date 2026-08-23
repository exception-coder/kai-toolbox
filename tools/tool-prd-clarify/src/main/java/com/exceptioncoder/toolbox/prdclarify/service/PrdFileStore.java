package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * PRD Markdown 文件的落盘读写。
 * 默认存储目录：{@code ~/.kai-toolbox/prd/}，每个会话一个 {@code {id}.md} 文件。
 */
@Component
public class PrdFileStore {

    private static final Logger log = LoggerFactory.getLogger(PrdFileStore.class);

    private final Path baseDir;

    public PrdFileStore() {
        this(Path.of(System.getProperty("user.home"), ".kai-toolbox", "prd"));
    }

    PrdFileStore(Path baseDir) {
        this.baseDir = baseDir.toAbsolutePath().normalize();
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

    /** 获取指定产物兼容旧接口的主文件绝对路径。 */
    public Path canonicalPathFor(String sessionId, PrdArtifactType type) {
        return resolveRelative(type.canonicalFileName(sessionId));
    }

    /** 将内容写入文件（覆盖）。 */
    public void write(String sessionId, String content) throws IOException {
        writeAtomically(PrdArtifactType.PRD.canonicalFileName(sessionId), content);
    }

    /**
     * 在目标同目录写入临时文件，并通过原子移动替换目标文件。
     *
     * @return 实际文件的相对路径、摘要和大小
     */
    public StoredFile writeAtomically(String relativePath, String content) throws IOException {
        Path target = resolveRelative(relativePath);
        Files.createDirectories(target.getParent());
        Path temporary = Files.createTempFile(target.getParent(), target.getFileName().toString() + ".", ".tmp");
        try {
            Files.writeString(temporary, content == null ? "" : content, StandardCharsets.UTF_8,
                    StandardOpenOption.TRUNCATE_EXISTING);
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return inspectRequired(relativePath);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    /** 读取账本相对路径对应的文件；缺失时返回空。 */
    public Optional<StoredFile> inspect(String relativePath) throws IOException {
        Path path = resolveRelative(relativePath);
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        return Optional.of(new StoredFile(normalizeRelative(relativePath), sha256(path), Files.size(path)));
    }

    /** 读取账本相对路径对应的内容；缺失时抛出异常。 */
    public String readRequired(String relativePath) throws IOException {
        Path path = resolveRelative(relativePath);
        if (!Files.isRegularFile(path)) {
            throw new IOException("PRD 产物文件不存在: " + relativePath);
        }
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    /** 返回账本专用目录下现存的 Markdown 相对路径。 */
    public List<String> listArtifactRelativePaths() throws IOException {
        Path artifactsDir = resolveRelative(".artifacts");
        if (!Files.isDirectory(artifactsDir)) {
            return List.of();
        }
        try (Stream<Path> paths = Files.walk(artifactsDir)) {
            return paths.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".md"))
                    .map(path -> baseDir.relativize(path).toString().replace('\\', '/'))
                    .sorted()
                    .toList();
        }
    }

    /** 读取文件内容；文件不存在时返回空字符串。 */
    public String read(String sessionId) throws IOException {
        Path path = pathFor(sessionId);
        if (!Files.exists(path)) {
            return "";
        }
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    /** 删除会话的兼容主文件和不可变产物目录；不存在时静默忽略。 */
    public void delete(String sessionId) throws IOException {
        for (PrdArtifactType type : PrdArtifactType.values()) {
            Files.deleteIfExists(canonicalPathFor(sessionId, type));
        }
        Path artifactBase = resolveRelative(".artifacts");
        Path sessionArtifacts = resolveRelative(".artifacts/" + sessionId);
        if (!sessionArtifacts.startsWith(artifactBase) || sessionArtifacts.equals(artifactBase)) {
            throw new IOException("拒绝删除越界的规格产物目录");
        }
        if (Files.isDirectory(sessionArtifacts)) {
            try (Stream<Path> paths = Files.walk(sessionArtifacts)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    private StoredFile inspectRequired(String relativePath) throws IOException {
        return inspect(relativePath)
                .orElseThrow(() -> new IOException("原子写入后文件不存在: " + relativePath));
    }

    private Path resolveRelative(String relativePath) {
        String normalizedRelative = normalizeRelative(relativePath);
        Path target = baseDir.resolve(normalizedRelative).normalize();
        if (!target.startsWith(baseDir)) {
            throw new IllegalArgumentException("PRD 产物路径越界: " + relativePath);
        }
        return target;
    }

    private String normalizeRelative(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("PRD 产物相对路径不能为空");
        }
        Path candidate = Path.of(relativePath);
        if (candidate.isAbsolute()) {
            throw new IllegalArgumentException("PRD 产物必须使用相对路径: " + relativePath);
        }
        return candidate.normalize().toString().replace('\\', '/');
    }

    private String sha256(Path path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (var input = Files.newInputStream(path)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) >= 0) {
                    digest.update(buffer, 0, read);
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("当前 JDK 不支持 SHA-256", e);
        }
    }

    /**
     * 文件落盘后的可核验元数据。
     *
     * @param relativePath PRD 基础目录下的相对路径
     * @param sha256 文件 SHA-256
     * @param sizeBytes 文件字节数
     */
    public record StoredFile(String relativePath, String sha256, long sizeBytes) {
    }
}
