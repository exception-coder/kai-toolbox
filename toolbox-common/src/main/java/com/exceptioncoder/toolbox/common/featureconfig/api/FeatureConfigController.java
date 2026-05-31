package com.exceptioncoder.toolbox.common.featureconfig.api;

import com.exceptioncoder.toolbox.common.featureconfig.api.dto.FeatureConfigSaveRequest;
import com.exceptioncoder.toolbox.common.featureconfig.api.dto.FeatureConfigView;
import com.exceptioncoder.toolbox.common.featureconfig.service.FeatureConfigService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 通用工具级配置 KV 接口。每个 feature 一行，value 是任意 JSON。
 * 见设计文档：ai-docs/kai-toolbox/design/feature-config-通用配置存储/
 */
@RestController
@RequestMapping("/api/feature-configs")
public class FeatureConfigController {

    private final FeatureConfigService service;
    private final ObjectMapper objectMapper;

    public FeatureConfigController(FeatureConfigService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/{featureId}")
    public FeatureConfigView get(@PathVariable String featureId) {
        return FeatureConfigView.from(service.findRequired(featureId), objectMapper);
    }

    @PutMapping("/{featureId}")
    public FeatureConfigView save(
            @PathVariable String featureId,
            @Valid @RequestBody FeatureConfigSaveRequest req
    ) {
        return FeatureConfigView.from(service.save(featureId, req.value()), objectMapper);
    }

    @DeleteMapping("/{featureId}")
    public ResponseEntity<Void> delete(@PathVariable String featureId) {
        service.delete(featureId);
        return ResponseEntity.noContent().build();
    }
}
