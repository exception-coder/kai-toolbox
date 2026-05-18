package com.exceptioncoder.toolbox.docviewer.service;

import com.exceptioncoder.toolbox.docviewer.api.dto.LocalFileDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.LocalSourceDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.LocalTreeResponseDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.SaveLocalFileResponse;
import com.exceptioncoder.toolbox.docviewer.api.dto.TreeNodeDTO;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerErrorCode;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerException;
import com.exceptioncoder.toolbox.docviewer.repository.LocalDocRepository;
import com.exceptioncoder.toolbox.docviewer.repository.entity.LocalDocSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 本地 markdown 目录浏览/编辑服务。
 *
 * 安全模型：
 * - 用户只能注册「根目录」，所有读写都必须落在 {@code rootReal} 之下；
 * - 任意外部传入的相对路径都会被 {@link #resolveSafe} 规范化并校验，越界一律拒绝；
 * - 编辑能力仅开放给文本（markdown/txt 等）扩展名，二进制只暴露元信息不允许写。
 */
@Service
public class LocalDocService {

    private static final Logger log = LoggerFactory.getLogger(LocalDocService.class);

    // 单文本文件硬上限 5 MB；超过认为不该在浏览器编辑器里玩
    private static final long MAX_TEXT_FILE_BYTES = 5L * 1024 * 1024;
    // 扫描节点上限 5000，防止误选大型工程目录把进程拖死
    private static final int MAX_TREE_NODES = 5000;
    // 跳过常见不该展示的目录
    private static final Set<String> SKIP_DIRS = Set.of(
            ".git", ".svn", ".hg", ".idea", ".vscode", "node_modules", "target", "build", "dist",
            ".gradle", ".mvn", "__pycache__", ".next", ".turbo", ".cache", "venv", ".venv");

    private final LocalDocRepository repo;
    private final SecureRandom rnd = new SecureRandom();

    public LocalDocService(LocalDocRepository repo) {
        this.repo = repo;
    }

    // === 源管理 ===

    public LocalSourceDTO createOrGetSource(String rawRoot, String alias) {
        if (rawRoot == null || rawRoot.isBlank()) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_LOCAL_PATH, "rootPath 不能为空");
        }
        Path real;
        try {
            real = Paths.get(rawRoot.trim()).toAbsolutePath().normalize().toRealPath();
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_LOCAL_PATH,
                    "无法定位目录: " + rawRoot + " (" + e.getMessage() + ")");
        }
        if (!Files.isDirectory(real, LinkOption.NOFOLLOW_LINKS)) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_NOT_DIRECTORY,
                    "不是目录: " + real);
        }
        String key = real.toString();

        Optional<LocalDocSource> exist = repo.findByRootPath(key);
        if (exist.isPresent()) {
            long now = System.currentTimeMillis();
            repo.updateLastVisited(exist.get().getId(), now);
            exist.get().setLastVisitedAt(now);
            return LocalSourceDTO.of(exist.get());
        }

        long now = System.currentTimeMillis();
        LocalDocSource s = LocalDocSource.builder()
                .id("loc_" + randomShortId())
                .alias(deriveAlias(alias, real))
                .rootPath(key)
                .lastVisitedAt(now)
                .createdAt(now)
                .build();
        try {
            repo.insert(s);
        } catch (DuplicateKeyException dup) {
            // 极小概率两个并发请求同时插同一路径
            return LocalSourceDTO.of(repo.findByRootPath(key).orElseThrow());
        }
        return LocalSourceDTO.of(s);
    }

    public List<LocalSourceDTO> listSources() {
        return repo.listAll().stream().map(LocalSourceDTO::of).toList();
    }

    public void deleteSource(String id) {
        requireSource(id);
        repo.delete(id);
    }

    // === 树扫描 ===

    public LocalTreeResponseDTO getTree(String sourceId) {
        LocalDocSource s = requireSource(sourceId);
        Path rootReal = realRoot(s);
        List<TreeNodeDTO> nodes = scan(rootReal);
        repo.updateLastVisited(s.getId(), System.currentTimeMillis());
        return LocalTreeResponseDTO.builder()
                .sourceId(s.getId())
                .rootPath(s.getRootPath())
                .nodes(nodes)
                .build();
    }

    // === 文件读取 ===

    public LocalFileDTO getFile(String sourceId, String relPath) {
        LocalDocSource s = requireSource(sourceId);
        Path rootReal = realRoot(s);
        Path target = resolveSafe(rootReal, relPath);

        if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_FILE_NOT_FOUND, "文件不存在: " + relPath);
        }
        if (Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_NOT_DIRECTORY,
                    "路径是目录而不是文件: " + relPath);
        }

        long size;
        long mtime;
        try {
            size = Files.size(target);
            mtime = Files.getLastModifiedTime(target, LinkOption.NOFOLLOW_LINKS).toMillis();
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR, "读取属性失败: " + e.getMessage(), e);
        }

        String name = target.getFileName().toString();
        if (!isTextLike(name)) {
            return LocalFileDTO.builder()
                    .sourceId(s.getId())
                    .path(relPath)
                    .kind("BINARY")
                    .size(size)
                    .content(null)
                    .lastModified(mtime)
                    .build();
        }
        if (size > MAX_TEXT_FILE_BYTES) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_FILE_TOO_LARGE,
                    "文件过大无法编辑（" + size + " bytes，上限 " + MAX_TEXT_FILE_BYTES + ")");
        }
        String content;
        try {
            content = Files.readString(target, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                    "读取文件失败: " + e.getMessage(), e);
        }
        return LocalFileDTO.builder()
                .sourceId(s.getId())
                .path(relPath)
                .kind("BLOB")
                .size(size)
                .content(content)
                .lastModified(mtime)
                .build();
    }

    // === 原始字节读取（图片等资源给浏览器直显） ===

    public RawBytes readRawBytes(String sourceId, String relPath) {
        LocalDocSource s = requireSource(sourceId);
        Path rootReal = realRoot(s);
        Path target = resolveSafe(rootReal, relPath);
        if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)
                || Files.isDirectory(target, LinkOption.NOFOLLOW_LINKS)) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_FILE_NOT_FOUND, "文件不存在: " + relPath);
        }
        try {
            long size = Files.size(target);
            // 8 MB 上限保护内存
            if (size > 8L * 1024 * 1024) {
                throw new DocViewerException(DocViewerErrorCode.LOCAL_FILE_TOO_LARGE,
                        "原始资源过大: " + size + " bytes");
            }
            byte[] bytes = Files.readAllBytes(target);
            String contentType = guessContentType(target.getFileName().toString());
            return new RawBytes(bytes, contentType);
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                    "读取原始字节失败: " + e.getMessage(), e);
        }
    }

    public record RawBytes(byte[] data, String contentType) {}

    private String guessContentType(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (isTextLike(name)) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    // === 文件写入 ===

    public SaveLocalFileResponse saveFile(String sourceId, String relPath, String content,
                                          long expectedLastModified) {
        LocalDocSource s = requireSource(sourceId);
        Path rootReal = realRoot(s);
        Path target = resolveSafeForWrite(rootReal, relPath);

        if (!isTextLike(target.getFileName().toString())) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_OUTSIDE_ROOT,
                    "只允许编辑文本类文件（.md/.markdown/.mdx/.txt 等）");
        }

        try {
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS) && expectedLastModified > 0) {
                long actual = Files.getLastModifiedTime(target, LinkOption.NOFOLLOW_LINKS).toMillis();
                // 允许 1 秒的时间漂移（FAT/NTFS 精度差异）
                if (Math.abs(actual - expectedLastModified) > 1000) {
                    throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                            "文件已被外部修改（mtime 不匹配），请先刷新后再保存");
                }
            }
            Path parent = target.getParent();
            if (parent != null && !Files.exists(parent)) {
                Files.createDirectories(parent);
            }
            byte[] bytes = content == null ? new byte[0] : content.getBytes(StandardCharsets.UTF_8);
            Files.write(target, bytes, StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            long size = Files.size(target);
            long mtime = Files.getLastModifiedTime(target, LinkOption.NOFOLLOW_LINKS).toMillis();
            return SaveLocalFileResponse.builder()
                    .sourceId(s.getId())
                    .path(relPath)
                    .size(size)
                    .lastModified(mtime)
                    .build();
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                    "保存失败: " + e.getMessage(), e);
        }
    }

    // === 内部 ===

    private LocalDocSource requireSource(String id) {
        return repo.findById(id).orElseThrow(() ->
                new DocViewerException(DocViewerErrorCode.SOURCE_NOT_FOUND, "本地目录源不存在: " + id));
    }

    private Path realRoot(LocalDocSource s) {
        try {
            Path p = Paths.get(s.getRootPath());
            if (!Files.isDirectory(p, LinkOption.NOFOLLOW_LINKS)) {
                throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_NOT_DIRECTORY,
                        "根目录已失效: " + s.getRootPath());
            }
            return p.toRealPath();
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                    "解析根目录失败: " + e.getMessage(), e);
        }
    }

    // 读取场景：路径必须真实存在，且 realPath 必须仍在 root 下（不允许跳出 / 不允许跟随软链到外面）
    private Path resolveSafe(Path rootReal, String relPath) {
        if (relPath == null) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_LOCAL_PATH, "path 不能为空");
        }
        Path resolved = rootReal.resolve(relPath).normalize();
        if (!resolved.startsWith(rootReal)) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_OUTSIDE_ROOT,
                    "路径越界: " + relPath);
        }
        if (!Files.exists(resolved, LinkOption.NOFOLLOW_LINKS)) {
            return resolved; // 由调用方判断
        }
        try {
            Path real = resolved.toRealPath();
            if (!real.startsWith(rootReal)) {
                throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_OUTSIDE_ROOT,
                        "路径越界（符号链接指向根目录外）: " + relPath);
            }
            return real;
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                    "解析路径失败: " + e.getMessage(), e);
        }
    }

    // 写入场景：父目录必须在 root 下；目标文件本身可以不存在
    private Path resolveSafeForWrite(Path rootReal, String relPath) {
        if (relPath == null || relPath.isBlank()) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_LOCAL_PATH, "path 不能为空");
        }
        Path resolved = rootReal.resolve(relPath).normalize();
        if (!resolved.startsWith(rootReal)) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_OUTSIDE_ROOT,
                    "路径越界: " + relPath);
        }
        Path parent = resolved.getParent();
        if (parent != null && Files.exists(parent, LinkOption.NOFOLLOW_LINKS)) {
            try {
                Path realParent = parent.toRealPath();
                if (!realParent.startsWith(rootReal)) {
                    throw new DocViewerException(DocViewerErrorCode.LOCAL_PATH_OUTSIDE_ROOT,
                            "父目录越界: " + relPath);
                }
            } catch (IOException e) {
                throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                        "解析父目录失败: " + e.getMessage(), e);
            }
        }
        return resolved;
    }

    private List<TreeNodeDTO> scan(Path rootReal) {
        List<TreeNodeDTO> out = new ArrayList<>();
        try {
            Files.walkFileTree(rootReal, new SimpleFileVisitor<Path>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    if (out.size() >= MAX_TREE_NODES) return FileVisitResult.TERMINATE;
                    String name = dir.getFileName() == null ? "" : dir.getFileName().toString();
                    if (!dir.equals(rootReal) && (name.startsWith(".") || SKIP_DIRS.contains(name))) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    if (!dir.equals(rootReal)) {
                        out.add(nodeOf(rootReal, dir, "TREE", null));
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (out.size() >= MAX_TREE_NODES) return FileVisitResult.TERMINATE;
                    String name = file.getFileName().toString();
                    if (name.startsWith(".")) return FileVisitResult.CONTINUE;
                    String kind = isTextLike(name) ? "BLOB" : "BINARY";
                    out.add(nodeOf(rootReal, file, kind, attrs.size()));
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    log.debug("skip unreadable: {} ({})", file, exc.getMessage());
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.LOCAL_IO_ERROR,
                    "扫描目录失败: " + e.getMessage(), e);
        }
        out.sort(Comparator
                .comparingInt(TreeNodeDTO::getDepth)
                .thenComparing(TreeNodeDTO::getPath));
        return out;
    }

    private TreeNodeDTO nodeOf(Path rootReal, Path p, String kind, Long size) {
        String rel = rootReal.relativize(p).toString().replace('\\', '/');
        int slash = rel.lastIndexOf('/');
        String name = slash < 0 ? rel : rel.substring(slash + 1);
        String parent = slash < 0 ? "" : rel.substring(0, slash);
        int depth = (int) rel.chars().filter(c -> c == '/').count();
        return TreeNodeDTO.builder()
                .path(rel)
                .name(name)
                .kind(kind)
                .sha("")
                .size(size)
                .parentPath(parent)
                .depth(depth)
                .build();
    }

    // 文本扩展白名单：超出这些的认为二进制不可编辑
    private boolean isTextLike(String name) {
        String lower = name.toLowerCase();
        return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx")
                || lower.endsWith(".txt") || lower.endsWith(".rst") || lower.endsWith(".adoc");
    }

    private String deriveAlias(String alias, Path real) {
        if (alias != null && !alias.isBlank()) return alias.trim();
        Path name = real.getFileName();
        return name == null ? real.toString() : name.toString();
    }

    private String randomShortId() {
        byte[] b = new byte[6];
        rnd.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte by : b) sb.append(String.format("%02x", by));
        return sb.toString();
    }
}
