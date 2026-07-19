package com.exceptioncoder.toolbox.webppt.exception;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;

@RestControllerAdvice(basePackages = "com.exceptioncoder.toolbox.webppt")
public class WebPptExceptionHandler {

    @ExceptionHandler(WebPptException.class)
    public ResponseEntity<Map<String, Object>> handle(WebPptException e) {
        return ResponseEntity.status(e.getCode().status()).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", e.getCode().status().value(),
                "errorCode", e.getCode().name(),
                "message", e.getMessage() == null ? "" : e.getMessage()
        ));
    }
}
