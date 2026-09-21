package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.claudechat.service.CodexModelCatalogService;
import com.exceptioncoder.toolbox.claudechat.service.CodexHomeDiscoveryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Exposes the Vibe Coding Codex model catalog before a chat session is created. */
@RestController
@RequestMapping("/api/claude-chat/codex")
public class CodexCatalogController {

    private final CodexModelCatalogService service;
    private final CodexHomeDiscoveryService homeDiscoveryService;

    public CodexCatalogController(CodexModelCatalogService service, CodexHomeDiscoveryService homeDiscoveryService) {
        this.service = service;
        this.homeDiscoveryService = homeDiscoveryService;
    }

    @GetMapping("/models")
    public List<ModelInfo> listModels(@RequestParam String codexHome) {
        return service.list(codexHome);
    }

    @GetMapping("/homes")
    public List<String> listHomes() {
        return homeDiscoveryService.list();
    }
}
