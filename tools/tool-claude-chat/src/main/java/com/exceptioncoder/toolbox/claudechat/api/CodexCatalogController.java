package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.claudechat.service.CodexModelCatalogService;
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

    public CodexCatalogController(CodexModelCatalogService service) {
        this.service = service;
    }

    @GetMapping("/models")
    public List<ModelInfo> listModels(@RequestParam String codexHome) {
        return service.list(codexHome);
    }
}
