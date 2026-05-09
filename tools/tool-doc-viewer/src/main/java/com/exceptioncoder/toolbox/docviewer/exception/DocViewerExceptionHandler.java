package com.exceptioncoder.toolbox.docviewer.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;

@RestControllerAdvice(basePackages = "com.exceptioncoder.toolbox.docviewer")
public class DocViewerExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(DocViewerExceptionHandler.class);

    @ExceptionHandler(DocViewerException.class)
    public ResponseEntity<Map<String, Object>> handle(DocViewerException e) {
        log.debug("doc-viewer error: code={} msg={}", e.getCode(), e.getMessage());
        return ResponseEntity.status(e.getCode().status()).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", e.getCode().status().value(),
                "errorCode", e.getCode().name(),
                "message", e.getMessage() == null ? "" : e.getMessage()
        ));
    }
}
