package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.FileContentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.FileEntryView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * 会话工作目录的只读文件浏览：懒加载列目录、预览文本文件、在系统资源管理器里定位文件。
 * 供前端「工作目录」文件树面板（类 Codex 展开工作目录快速找文件）使用。
 *
 * <p>安全：路径不收任意绝对路径，只认 sessionId（服务端取 cwd）+ 相对 path；相对 path 经
 * {@code normalize()} 后校验仍在 cwd 内（{@code startsWith(cwd)}）杜绝 {@code ../} 穿越。
 * 采用逻辑路径校验（不 toRealPath），以便正常进入 taskspace 聚合目录下指向真实仓库的 junction/symlink 子目录。</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/claude-chat/sessions/{id}")
public class SessionFileController {

    /** 目录单页最多返回条目数，防超大目录拖垮前端。 */
    private static final int MAX_ENTRIES = 2000;
    /** 文本预览上限（字节）：超出截断。 */
    private static final int MAX_PREVIEW_BYTES = 512 * 1024;
    private static final boolean IS_WINDOWS =
            System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    private static final boolean IS_MAC =
            System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("mac");

    private final ClaudeChatSessionRepository repo;

    public SessionFileController(ClaudeChatSessionRepository repo) {
        this.repo = repo;
    }

    /** 列某目录（相对 cwd，空=cwd 根）的一级内容：目录在前、文件在后，各按名排序。 */
    @GetMapping("/files")
    public List<FileEntryView> files(@PathVariable String id, @RequestParam(required = false) String path) {
        Path cwd = sessionCwd(id);
        Path dir = resolveWithin(cwd, path);
        if (!Files.isDirectory(dir)) {
            throw new IllegalArgumentException("不是目录");
        }
        List<FileEntryView> out = new ArrayList<>();
        try (Stream<Path> s = Files.list(dir)) {
            s.limit(MAX_ENTRIES).forEach(p -> {
                boolean isDir = Files.isDirectory(p);
                long size = 0, mtime = 0;
                try {
                    BasicFileAttributes a = Files.readAttributes(p, BasicFileAttributes.class);
                    size = isDir ? 0 : a.size();
                    mtime = a.lastModifiedTime().toMillis();
                } catch (IOException ignore) {
                    // 读属性失败（权限/瞬时）不致命，条目仍列出
                }
                out.add(new FileEntryView(p.getFileName().toString(), rel(cwd, p), isDir, size, mtime));
            });
        } catch (IOException e) {
            throw new IllegalStateException("读取目录失败：" + e.getMessage(), e);
        }
        out.sort(Comparator
                .comparing((FileEntryView f) -> f.dir() ? 0 : 1)
                .thenComparing(f -> f.name().toLowerCase(Locale.ROOT)));
        return out;
    }

    /** 预览一个文本文件（相对 cwd）。二进制/超大均安全返回，不抛。 */
    @GetMapping("/file")
    public FileContentView file(@PathVariable String id, @RequestParam String path) {
        Path cwd = sessionCwd(id);
        Path f = resolveWithin(cwd, path);
        if (!Files.isRegularFile(f)) {
            throw new IllegalArgumentException("不是文件");
        }
        long size;
        byte[] bytes;
        boolean truncated;
        try {
            size = Files.size(f);
            try (var in = Files.newInputStream(f)) {
                bytes = in.readNBytes(MAX_PREVIEW_BYTES);
            }
            truncated = size > bytes.length;
        } catch (IOException e) {
            throw new IllegalStateException("读取文件失败：" + e.getMessage(), e);
        }
        String name = f.getFileName().toString();
        if (looksBinary(bytes)) {
            return new FileContentView(name, rel(cwd, f), size, true, false, "");
        }
        String text;
        try {
            var decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            text = decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            // 非 UTF-8（可能 GBK 等）：宽松解码兜底，保证可预览（乱码由用户判断），不当二进制拒绝
            text = new String(bytes, StandardCharsets.UTF_8);
        }
        return new FileContentView(name, rel(cwd, f), size, false, truncated, text);
    }

    /** 在系统资源管理器/Finder 里定位文件（相对 cwd）。本机单用户工具，best-effort，不阻塞。 */
    @PostMapping("/reveal")
    public void reveal(@PathVariable String id, @RequestBody RevealRequest req) {
        Path cwd = sessionCwd(id);
        Path target = resolveWithin(cwd, req.path());
        if (!Files.exists(target)) {
            throw new IllegalArgumentException("路径不存在");
        }
        String abs = target.toAbsolutePath().toString();
        List<String> cmd;
        if (IS_WINDOWS) {
            cmd = Files.isDirectory(target) ? List.of("explorer.exe", abs) : List.of("explorer.exe", "/select,", abs);
        } else if (IS_MAC) {
            cmd = Files.isDirectory(target) ? List.of("open", abs) : List.of("open", "-R", abs);
        } else {
            // Linux：无统一「选中」命令，退而打开其所在目录
            Path openDir = Files.isDirectory(target) ? target : target.getParent();
            cmd = List.of("xdg-open", (openDir != null ? openDir : target).toAbsolutePath().toString());
        }
        try {
            new ProcessBuilder(cmd).start(); // 不 waitFor：explorer 常返回非 0，且无需其退出
        } catch (IOException e) {
            throw new IllegalStateException("打开文件管理器失败：" + e.getMessage(), e);
        }
    }

    public record RevealRequest(String path) {
    }

    // ── 内部：cwd 解析 + 路径安全 ────────────────────────────────────

    private Path sessionCwd(String id) {
        ClaudeChatSession s = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "会话不存在"));
        String cwd = s.getCwd();
        if (cwd == null || cwd.isBlank()) {
            throw new IllegalArgumentException("会话无工作目录");
        }
        Path dir;
        try {
            dir = Path.of(cwd).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            throw new IllegalArgumentException("会话工作目录非法");
        }
        if (!Files.isDirectory(dir)) {
            throw new IllegalArgumentException("会话工作目录不存在");
        }
        return dir;
    }

    /** 把相对路径 rel 安全解析到 cwd 内：规范化后必须仍以 cwd 为前缀，杜绝 ../ 穿越。空/根返回 cwd。 */
    private Path resolveWithin(Path cwd, String rel) {
        if (rel == null || rel.isBlank() || rel.equals("/") || rel.equals(".")) {
            return cwd;
        }
        Path target;
        try {
            target = cwd.resolve(rel).normalize();
        } catch (InvalidPathException e) {
            throw new IllegalArgumentException("路径非法");
        }
        if (!target.startsWith(cwd)) {
            throw new IllegalArgumentException("路径越界");
        }
        return target;
    }

    /** cwd 到 p 的相对路径，统一用 / 分隔（前端跨平台稳定）。 */
    private static String rel(Path cwd, Path p) {
        return cwd.relativize(p).toString().replace('\\', '/');
    }

    /** 简单二进制探测：前若干字节含 NUL 即判为二进制。 */
    private static boolean looksBinary(byte[] bytes) {
        int n = Math.min(bytes.length, 8000);
        for (int i = 0; i < n; i++) {
            if (bytes[i] == 0) {
                return true;
            }
        }
        return false;
    }
}
