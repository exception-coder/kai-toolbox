package com.regentech_fashion.supplierquote.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestControllerAdvice(assignableTypes = {WechatIdentityController.class, ScmBindingController.class,
        SupplierQuotationController.class})
public class SupplierQuoteExceptionHandler {
    @ExceptionHandler(SupplierQuoteApiException.class)
    public ResponseEntity<Map<String, Object>> handle(SupplierQuoteApiException exception) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("errorCode", exception.errorCode());
        body.put("message", exception.getMessage());
        body.put("traceId", UUID.randomUUID().toString());
        body.put("details", exception.details());
        return ResponseEntity.status(exception.status()).body(body);
    }
}
