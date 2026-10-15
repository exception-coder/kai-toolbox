package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentRequest;
import com.exceptioncoder.toolbox.foreconsult.service.documents.ConsultLayoutValidator;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.util.WorkbookUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

import static org.springframework.http.HttpStatus.*;

/** 咨询文档唯一写入口：内容寻址、受控目录、容量限制与会话归属分离验证。 */
@Service
public class ConsultDocumentService {
    private static final int MAX_CONTENT_CHARS = 300_000;
    private static final long MAX_FILE_BYTES = 10L * 1024 * 1024;
    private static final long MAX_SESSION_BYTES = 250L * 1024 * 1024;
    private static final long MAX_TOTAL_BYTES = 2L * 1024 * 1024 * 1024;
    private final Path root;
    private final ObjectMapper mapper;
    private final ConsultSessionRepository sessions;
    private final ConsultDocumentRenderer renderer;
    private final java.util.concurrent.Semaphore previewSlots = new java.util.concurrent.Semaphore(2);

    @Autowired
    public ConsultDocumentService(ObjectMapper mapper, ConsultSessionRepository sessions,
                                  ConsultDocumentRenderer renderer) {
        this(Path.of(System.getProperty("user.home"), ".kai-toolbox", "consult-artifacts"),
                mapper, sessions, renderer);
    }

    ConsultDocumentService(Path root, ObjectMapper mapper, ConsultSessionRepository sessions,
                           ConsultDocumentRenderer renderer) {
        this.root = root.toAbsolutePath().normalize();
        this.mapper = mapper;
        this.sessions = sessions;
        this.renderer = renderer;
    }

    /** 运行时凭据在控制器核验，这里再次核对运行时确实关联咨询，禁止由工具参数选择其它会话。 */
    public synchronized Document create(String runtimeId, JsonNode content) throws IOException {
        var session = sessions.findByDevSessionId(runtimeId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "未关联咨询会话"));
        if (session.getEndedAt() != null) {
            throw new ResponseStatusException(CONFLICT, "咨询已结束，可下载已有文件；请在新咨询生成新文档");
        }
        var request = validate(content);
        var canonical = mapper.<com.fasterxml.jackson.databind.node.ObjectNode>valueToTree(request);
        if (request.layout() == null) { canonical.remove("layout"); }
        String id = digest(mapper.writeValueAsBytes(canonical));
        Path directory = directory(session.getSessionId(), true);
        Path manifest = directory.resolve(id + ".json");
        if (Files.exists(manifest, LinkOption.NOFOLLOW_LINKS)) {
            return read(directory, id);
        }
        enforceQuota(directory);
        byte[] bytes = renderer.render(request);
        if (bytes.length > MAX_FILE_BYTES) {
            throw new IllegalArgumentException("生成文件超过 10 MB，请拆分内容");
        }
        String name = request.title().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_")
                .replaceAll("[. ]+$", "") + "." + request.format();
        var document = new Document(id, session.getSessionId(), name, request.format(), bytes.length,
                System.currentTimeMillis(), ".kai-toolbox/consult-artifacts/" + session.getSessionId()
                + "/" + id + "." + request.format(), downloadUrl(session.getSessionId(), id));
        Path target = directory.resolve(id + "." + request.format());
        checkPath(target);
        Path temporary = Files.createTempFile(directory, "document-", ".tmp");
        Path metadata = Files.createTempFile(directory, "metadata-", ".tmp");
        try {
            Files.write(temporary, bytes);
            mapper.writeValue(metadata.toFile(), document);
            // 元数据最后发布；重试相同内容复用同一 ID，不修改其它文档。
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            Files.move(metadata, manifest, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(temporary);
            Files.deleteIfExists(metadata);
        }
        return document;
    }

    /** 调用方须先按现有 ConsultService 校验登录用户与会话归属。 */
    public synchronized List<Document> list(String sessionId) throws IOException {
        Path directory = directory(sessionId, false);
        if (!Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
            return List.of();
        }
        try (var files = Files.list(directory)) {
            var ids = files.map(path -> path.getFileName().toString())
                    .filter(name -> name.matches("[a-f0-9]{64}\\.json"))
                    .map(name -> name.substring(0, 64)).toList();
            var result = new java.util.ArrayList<Document>();
            for (String id : ids) {
                result.add(read(directory, id));
            }
            return result.stream().sorted(Comparator.comparingLong(Document::createdAt).reversed()).toList();
        }
    }

    /** 下载只接受文件 ID，不接受文件路径。 */
    public synchronized Download download(String sessionId, String id) throws IOException {
        if (id == null || !id.matches("[a-f0-9]{64}")) {
            throw new ResponseStatusException(NOT_FOUND, "文档不存在");
        }
        Path directory = directory(sessionId, false);
        Document document = read(directory, id);
        Path file = directory.resolve(id + "." + document.format());
        return new Download(document, Files.readAllBytes(file));
    }

    /** 从受控文件生成预览，不保存新文件；仍要求调用方先核验会话权限。 */
    public Preview preview(String sessionId, String id, int page) throws IOException {
        if (!previewSlots.tryAcquire()) {
            throw new ResponseStatusException(TOO_MANY_REQUESTS, "预览正在忙，请稍后重试");
        }
        try {
            var download = download(sessionId, id);
            var result = com.exceptioncoder.toolbox.foreconsult.service.documents.ConsultDocumentPreview
                    .render(download.document().format(), download.content(), page);
            return new Preview("image/png", java.util.Base64.getEncoder().encodeToString(result.png()),
                    result.kind(), result.notes(), page, result.totalPages());
        } finally { previewSlots.release(); }
    }

    /** MCP签名只对应本运行时关联的咨询，不从模型参数接收咨询ID。 */
    public Preview previewForRuntime(String runtimeId, String id, int page) throws IOException {
        String consultId = sessions.findByDevSessionId(runtimeId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "未关联咨询会话")).getSessionId();
        return preview(consultId, id, page);
    }

    /** 预览图与真实性说明；不返回磁盘路径或凭据。 */
    public record Preview(String mimeType, String imageBase64, String kind, List<String> notes,
                          int page, int totalPages) { }

    private Document read(Path directory, String id) throws IOException {
        Path manifest = directory.resolve(id + ".json");
        checkPath(manifest);
        if (!Files.isRegularFile(manifest, LinkOption.NOFOLLOW_LINKS)) {
            throw new ResponseStatusException(NOT_FOUND, "文档不存在");
        }
        if (Files.size(manifest) > 4096) {
            throw new IOException("文档索引异常");
        }
        Document document = mapper.readValue(manifest.toFile(), Document.class);
        if (!id.equals(document.id()) || !directory.getFileName().toString().equals(document.sessionId())
                || !Set.of("docx", "xlsx", "pptx").contains(document.format())) {
            throw new IOException("文档索引无效");
        }
        Path file = directory.resolve(id + "." + document.format());
        checkPath(file);
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > MAX_FILE_BYTES
                || Files.size(file) != document.bytes()) {
            throw new ResponseStatusException(NOT_FOUND, "文档文件缺失或大小异常");
        }
        return document;
    }

    private Path directory(String sessionId, boolean create) throws IOException {
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9-]{1,100}")) {
            throw new IllegalArgumentException("咨询会话标识无效");
        }
        Path directory = root.resolve(sessionId);
        checkPath(directory);
        if (create) {
            Files.createDirectories(directory);
            checkPath(directory);
        }
        return directory;
    }

    private void checkPath(Path target) throws IOException {
        if (!target.normalize().startsWith(root)) {
            throw new IOException("文档路径超出受控目录");
        }
        // 拒绝符号链接和 Windows junction，不允许目录映射到受控区之外。
        for (Path cursor = target; cursor != null; cursor = cursor.getParent()) {
            if (Files.exists(cursor, LinkOption.NOFOLLOW_LINKS)
                    && (Files.isSymbolicLink(cursor)
                    || !cursor.toRealPath().equals(cursor.toAbsolutePath().normalize()))) {
                throw new IOException("文档目录不可包含链接或重解析路径");
            }
        }
    }

    private void enforceQuota(Path directory) throws IOException {
        long totalBytes = 0;
        long sessionBytes = 0;
        int totalCount = 0;
        int sessionCount = 0;
        try (var files = Files.walk(root, 2)) {
            for (Path path : files.filter(file -> Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)).toList()) {
                long size = Files.size(path);
                totalBytes += size;
                totalCount++;
                if (directory.equals(path.getParent())) {
                    sessionBytes += size;
                    sessionCount++;
                }
            }
        }
        if (sessionCount >= 200 || sessionBytes + MAX_FILE_BYTES > MAX_SESSION_BYTES
                || totalCount >= 4000 || totalBytes + MAX_FILE_BYTES > MAX_TOTAL_BYTES) {
            throw new ResponseStatusException(INSUFFICIENT_STORAGE, "文档存储额度不足，请联系管理员整理受控文档目录");
        }
    }

    private ConsultDocumentRequest validate(JsonNode content) throws IOException {
        if (content == null || !content.isObject() || content.toString().length() > MAX_CONTENT_CHARS) {
            throw new IllegalArgumentException("文档内容须为对象且不超过 30 万字符");
        }
        ConsultDocumentRequest document;
        try {
            document = mapper.readerFor(ConsultDocumentRequest.class)
                    .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(content);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalArgumentException("文档结构无效：仅接受内容字段，不接受路径、模板或脚本", exception);
        }
        text(document.title(), 80, false);
        if (document.format() == null) {
            throw new IllegalArgumentException("请选择 docx、xlsx 或 pptx");
        }
        switch (document.format()) {
            case "docx" -> {
                exclusive(document.sheets(), document.slides());
                count(document.sections(), 1, 80);
                int paragraphs = 0;
                int cells = 0;
                for (var section : document.sections()) {
                    text(section.heading(), 160, true);
                    if (section.paragraphs() != null) {
                        count(section.paragraphs(), 0, 200);
                        paragraphs += section.paragraphs().size();
                        section.paragraphs().forEach(value -> text(value, 8000, false));
                    }
                    if (section.table() != null && !section.table().isEmpty()) {
                        count(section.table(), 1, 200);
                        int columns = section.table().getFirst().size();
                        if (columns < 1 || columns > 12) {
                            throw new IllegalArgumentException("Word 表格支持 1–12 列");
                        }
                        cells += section.table().size() * columns;
                        section.table().forEach(row -> {
                            count(row, columns, columns);
                            row.forEach(value -> text(value, 2000, true));
                        });
                    }
                }
                if (paragraphs > 1000 || cells > 10_000) {
                    throw new IllegalArgumentException("Word 总段落不得超过1000，表格总单元格不得超过10000，请拆分生成");
                }
            }
            case "xlsx" -> {
                exclusive(document.sections(), document.slides());
                count(document.sheets(), 1, 10);
                Set<String> names = new HashSet<>();
                int cells = 0;
                for (var sheet : document.sheets()) {
                    WorkbookUtil.validateSheetName(sheet.name());
                    if (!names.add(sheet.name().toLowerCase(java.util.Locale.ROOT))) {
                        throw new IllegalArgumentException("工作表名称不能重复");
                    }
                    count(sheet.columns(), 1, 40);
                    sheet.columns().forEach(value -> text(value, 120, false));
                    count(sheet.rows(), 0, 2000);
                    cells += (sheet.rows().size() + 1) * sheet.columns().size();
                    for (var row : sheet.rows()) {
                        if (row.size() != sheet.columns().size()) {
                            throw new IllegalArgumentException("Excel 每行单元格数量须与表头一致");
                        }
                        for (Object value : row) {
                            if (value instanceof String string) {
                                text(string, 8000, true);
                            } else if (value != null && !(value instanceof Number) && !(value instanceof Boolean)) {
                                throw new IllegalArgumentException("单元格仅支持文本、数字、布尔值或 null");
                            } else if (value instanceof Number number && !Double.isFinite(number.doubleValue())) {
                                throw new IllegalArgumentException("数字必须是有限数值");
                            } else if (value instanceof Number number
                                    && new java.math.BigDecimal(number.toString()).stripTrailingZeros().precision() > 15) {
                                throw new IllegalArgumentException("Excel 数字超过15位有效精度，请使用字符串保留原值");
                            }
                        }
                    }
                }
                if (cells > 10_000) {
                    throw new IllegalArgumentException("Excel 总单元格不得超过 10000，请拆分导出");
                }
            }
            case "pptx" -> {
                exclusive(document.sections(), document.sheets());
                if (document.layout() != null && document.layout().pages() != null) {
                    if (document.slides() != null) { throw new IllegalArgumentException("自定义pages与快速slides不可同时提供"); }
                    break;
                }
                count(document.slides(), 1, 30);
                for (var slide : document.slides()) {
                    text(slide.title(), 36, false);
                    if (slide.title().contains("\n") || slide.title().contains("\r")) {
                        throw new IllegalArgumentException("PPT 标题须为单行");
                    }
                    count(slide.bullets(), 1, 6);
                    slide.bullets().forEach(value -> {
                        text(value, 65, false);
                        if (value.contains("\n") || value.contains("\r") || value.contains("\t")) {
                            throw new IllegalArgumentException("PPT 每条要点须为单行，请拆成多条或多页");
                        }
                    });
                }
            }
            default -> throw new IllegalArgumentException("仅支持 docx、xlsx、pptx，不支持宏或可执行文件");
        }
        ConsultLayoutValidator.validate(document);
        return document;
    }

    private static void exclusive(List<?> first, List<?> second) {
        if (first != null || second != null) {
            throw new IllegalArgumentException("只能提供当前格式对应的 sections、sheets 或 slides");
        }
    }

    private static void count(List<?> values, int min, int max) {
        if (values == null || values.size() < min || values.size() > max || values.stream().anyMatch(v -> v == null)) {
            throw new IllegalArgumentException("文档列表数量须在 " + min + "–" + max + " 范围内，不能包含 null");
        }
    }

    private static void text(String value, int max, boolean optional) {
        if (value == null && optional) {
            return;
        }
        if (value == null || (!optional && value.isBlank()) || value.length() > max
                || value.codePoints().anyMatch(code -> (code < 32 && code != 9 && code != 10 && code != 13)
                || (code >= 0xD800 && code <= 0xDFFF) || code == 0xFFFE || code == 0xFFFF)) {
            throw new IllegalArgumentException("文档文本为空、超长或包含非法控制字符（上限 " + max + "）");
        }
    }

    private static String digest(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    private static String downloadUrl(String sessionId, String id) {
        return "/api/fore-consult/sessions/" + sessionId + "/documents/" + id + "/download";
    }

    /** 持久化的文档索引，不含用户凭据和原始提示词。 */
    public record Document(String id, String sessionId, String name, String format, long bytes,
                           long createdAt, String storagePath, String downloadUrl) { }

    /** 下载的元数据和有界文件内容。 */
    public record Download(Document document, byte[] content) { }
}
