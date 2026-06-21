package com.exceptioncoder.toolbox.common.dynamicconfig.api;

import com.exceptioncoder.toolbox.common.dynamicconfig.api.dto.ConfigBlockView;
import com.exceptioncoder.toolbox.common.dynamicconfig.api.dto.UpdateOverridesRequest;
import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 运行时动态配置中心接口。blockId = 配置块的 @ConfigurationProperties prefix。
 * 见设计文档：ai-docs/kai-toolbox/design/运行时动态配置中心/
 */
@RestController
@RequestMapping("/api/config")
public class DynamicConfigController {

    private final DynamicConfigService service;

    public DynamicConfigController(DynamicConfigService service) {
        this.service = service;
    }

    @GetMapping("/blocks")
    public Map<String, Object> listBlocks() {
        return Map.of("blocks", service.listBlocks());
    }

    @GetMapping("/blocks/{id}")
    public ConfigBlockView getBlock(@PathVariable String id) {
        return service.view(id);
    }

    @PutMapping("/blocks/{id}")
    public ConfigBlockView update(@PathVariable String id, @Valid @RequestBody UpdateOverridesRequest req) {
        return service.applyOverrides(id, req.overrides(), req.replacePrefixes());
    }

    @DeleteMapping("/blocks/{id}/overrides")
    public ConfigBlockView reset(@PathVariable String id) {
        return service.reset(id);
    }
}
