package com.exceptioncoder.toolbox.prdclarify.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 需求附件文本提取服务：支持 Markdown / PDF / Word (.docx)。
 *
 * <p>提取的文本会被截断到 {@link #MAX_CHARS} 个字符，避免超出 LLM context 限制。
 */
@Slf4j
@Service
public class AttachmentParseService {

    /** 单个附件最大提取字符数（约 5000-8000 token，避免超限）。 */
    private static final int MAX_CHARS = 20_000;

    /** 支持的 MIME 类型。 */
    private static final java.util.Set<String> SUPPORTED_TYPES = java.util.Set.of(
            "text/markdown", "text/plain",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword"
    );

    /**
     * 解析上传的附件，提取其中的文本内容。
     *
     * @param file 上传的文件（MD / PDF / DOCX）
     * @return 提取结果
     * @throws IOException 文件读取或解析失败
     */
    public ParseResult parse(MultipartFile file) throws IOException {
        String originalName = file.getOriginalFilename() != null
                ? file.getOriginalFilename() : "unknown";
        String contentType = detectContentType(file);

        String rawText;
        try (InputStream is = file.getInputStream()) {
            rawText = switch (contentType) {
                case "application/pdf" -> parsePdf(is);
                case "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                     "application/msword" -> parseDocx(is);
                default -> parseText(is);  // Markdown / 纯文本
            };
        }

        boolean truncated = rawText.length() > MAX_CHARS;
        String text = truncated ? rawText.substring(0, MAX_CHARS) + "\n…（内容已截断，超出 " + MAX_CHARS + " 字符限制）" : rawText;

        log.info("[prd-clarify] 附件解析完成 name={} type={} chars={} truncated={}",
                originalName, contentType, text.length(), truncated);

        return new ParseResult(originalName, contentType, text, truncated);
    }

    public boolean isSupported(MultipartFile file) {
        String ext = getExtension(file.getOriginalFilename());
        return "md".equals(ext) || "txt".equals(ext) || "pdf".equals(ext)
                || "docx".equals(ext) || "doc".equals(ext);
    }

    // ───── 各格式解析 ─────

    private String parsePdf(InputStream is) throws IOException {
        // PDFBox 3.x：Loader.loadPDF() 替代已移除的 PDDocument.load()
        byte[] bytes = is.readAllBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(doc).strip();
        }
    }

    private String parseDocx(InputStream is) throws IOException {
        try (XWPFDocument doc = new XWPFDocument(is);
             XWPFWordExtractor extractor = new XWPFWordExtractor(doc)) {
            return extractor.getText().strip();
        }
    }

    private String parseText(InputStream is) throws IOException {
        return new String(is.readAllBytes(), StandardCharsets.UTF_8).strip();
    }

    // ───── 工具方法 ─────

    private String detectContentType(MultipartFile file) {
        String ext = getExtension(file.getOriginalFilename());
        return switch (ext) {
            case "pdf" -> "application/pdf";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "doc" -> "application/msword";
            default -> "text/plain";  // md / txt
        };
    }

    private static String getExtension(String filename) {
        if (filename == null) return "";
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : "";
    }

    /**
     * 附件解析结果。
     *
     * @param fileName    原始文件名
     * @param contentType 检测到的 MIME 类型
     * @param text        提取的文本（可能已截断）
     * @param truncated   是否因超出字符限制而被截断
     */
    public record ParseResult(String fileName, String contentType, String text, boolean truncated) {}
}
