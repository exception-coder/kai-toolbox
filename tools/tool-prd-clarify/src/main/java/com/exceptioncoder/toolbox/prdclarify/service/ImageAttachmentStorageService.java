package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.api.dto.ImageAttachmentView;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * "原始需求描述"文本域直接粘贴图片的落盘存储。
 *
 * <p>粘贴发生在「填写需求」步骤，此时 PRD 会话还没创建（{@code createSession} 要等这一步
 * 提交后才调用），所以图片没有 sessionId 可挂靠——扁平按 attachmentId 存放，用法和目录布局
 * 对齐 {@code tool-ai-chat} 的 {@code AttachmentStorageService}（同样是"粘贴图片、没有会话
 * 上下文"场景），只是根目录换成本模块自己的 {@code ~/.kai-toolbox/prd/attachments/}，
 * 跟 {@link PrdFileStore} 的 {@code ~/.kai-toolbox/prd/} 保持同一个基准目录，不引入新的
 * {@code toolbox.data-dir} 配置依赖。</p>
 *
 * <p>图片本体只落盘，不会被喂给 LLM——{@code PrdClarifyService} 走的 {@code AgentOneShotRunner}
 * 是纯文本接口，不支持多模态；粘贴图片后插入文本域的是一段 Markdown 图片语法
 * {@code ![粘贴图片N](url)}，仅用于：①编辑器/历史预览里把 PRD 渲染成 Markdown 时能看到真实
 * 图片；②后续走 Vibe Coding 交给 Claude Agent SDK sidecar 时，sidecar 有本地文件系统访问权限，
 * 能用 Read 工具真正"看到"图片内容（跟 claude-chat 附件走 sidecar Read 是同一条路子）。</p>
 */
@Service
public class ImageAttachmentStorageService {

    private static final Logger log = LoggerFactory.getLogger(ImageAttachmentStorageService.class);
    private static final long MAX_BYTES = 20L * 1024 * 1024;

    private final Path root;

    public ImageAttachmentStorageService() {
        this.root = Path.of(System.getProperty("user.home"), ".kai-toolbox", "prd", "attachments")
                .toAbsolutePath().normalize();
    }

    @PostConstruct
    public void init() throws IOException {
        Files.createDirectories(root);
        log.info("[prd-clarify] 图片附件目录：{}", root);
    }

    /** 下载文件三元组。 */
    public record DownloadFile(Path path, String mime, String name) {
    }

    public ImageAttachmentView store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "图片为空");
        }
        String mime = file.getContentType();
        if (mime == null || !mime.startsWith("image/")) {
            throw new ResponseStatusException(BAD_REQUEST, "仅支持图片文件");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(BAD_REQUEST, "图片超过 20MB 上限");
        }
        String id = "img_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        String name = sanitize(file.getOriginalFilename());
        Path dir = resolveDir(id);
        try {
            Files.createDirectories(dir);
            Files.copy(file.getInputStream(), dir.resolve(name));
        } catch (IOException e) {
            throw new UncheckedIOException("图片落盘失败", e);
        }
        return new ImageAttachmentView(id, name, mime, url(id));
    }

    public DownloadFile locate(String id) {
        Path dir = resolveDir(id);
        if (!Files.isDirectory(dir)) {
            throw new ResponseStatusException(NOT_FOUND, "图片不存在");
        }
        try (var stream = Files.list(dir)) {
            Path file = stream.filter(Files::isRegularFile).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "图片不存在"));
            String mime = probe(file);
            return new DownloadFile(file, mime, file.getFileName().toString());
        } catch (IOException e) {
            throw new UncheckedIOException("读取图片失败", e);
        }
    }

    /** 越权防护：解析后的目录必须仍在 root 下。 */
    private Path resolveDir(String id) {
        Path dir = root.resolve(id).normalize();
        if (!dir.startsWith(root)) {
            throw new ResponseStatusException(BAD_REQUEST, "非法附件 id");
        }
        return dir;
    }

    private static String probe(Path file) {
        try {
            String m = Files.probeContentType(file);
            return m != null ? m : "application/octet-stream";
        } catch (IOException e) {
            return "application/octet-stream";
        }
    }

    private static String sanitize(String original) {
        if (original == null || original.isBlank()) {
            return "image";
        }
        String base = Path.of(original).getFileName().toString();
        return base.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static String url(String id) {
        return "/api/prd-clarify/attachments/image/" + id;
    }
}
