package com.regentech_fashion.supplierquote.api;

import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestControllerAdvice(assignableTypes = {WechatIdentityController.class, BusinessAccountBindingController.class,
        SupplierQuotationController.class, MarketQuoteController.class})
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

    /** 隐藏数据库实现细节，避免 SQL 和表结构进入 H5 错误提示。 */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> handleDataAccess(DataAccessException exception) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("errorCode", "SUPPLIER_QUOTE_STORAGE_UNAVAILABLE");
        body.put("message", "报价服务数据暂时繁忙，请稍后重试");
        body.put("traceId", UUID.randomUUID().toString());
        body.put("details", Map.of());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
