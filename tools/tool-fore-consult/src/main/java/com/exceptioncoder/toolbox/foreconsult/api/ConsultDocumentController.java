package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultDocumentService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultResourceAccess;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** 生成使用服务端签名，用户下载使用登录态及原咨询会话所有权。 */
@RestController
@RequestMapping("/api/fore-consult")
public class ConsultDocumentController {
    private final ConsultDocumentService documents;
    private final ConsultResourceAccess access;
    private final ConsultService consults;

    public ConsultDocumentController(ConsultDocumentService documents, ConsultResourceAccess access,
                                     ConsultService consults) {
        this.documents = documents;
        this.access = access;
        this.consults = consults;
    }

    @PostMapping("/document-tools/sessions/{runtimeId}")
    public ConsultDocumentService.Document create(@PathVariable String runtimeId, @RequestBody JsonNode content,
            @RequestHeader(value = "X-Consult-Resource-Token", required = false) String token) throws IOException {
        access.require(runtimeId, token);
        return documents.create(runtimeId, content);
    }

    @GetMapping("/sessions/{sessionId}/documents")
    @RequireAuth
    public List<ConsultDocumentService.Document> list(@PathVariable String sessionId) throws IOException {
        consults.get(sessionId);
        return documents.list(sessionId);
    }

    @GetMapping("/sessions/{sessionId}/documents/{id}/download")
    @RequireAuth
    public ResponseEntity<byte[]> download(@PathVariable String sessionId, @PathVariable String id) throws IOException {
        consults.get(sessionId);
        var download = documents.download(sessionId, id);
        String suffix = switch (download.document().format()) {
            case "docx" -> "wordprocessingml.document";
            case "xlsx" -> "spreadsheetml.sheet";
            case "pptx" -> "presentationml.presentation";
            default -> throw new IllegalStateException("文档类型无效");
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/vnd.openxmlformats-officedocument." + suffix)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(download.document().name(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .body(download.content());
    }
}
