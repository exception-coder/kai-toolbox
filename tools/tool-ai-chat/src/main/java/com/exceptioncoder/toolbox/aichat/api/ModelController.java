package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.aichat.api.dto.ModelsView;
import com.exceptioncoder.toolbox.aichat.service.ModelCatalogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai-chat/models")
public class ModelController {

    private final ModelCatalogService service;

    public ModelController(ModelCatalogService service) {
        this.service = service;
    }

    @GetMapping
    public ModelsView models(@RequestParam(required = false, defaultValue = "false") boolean refresh) {
        return service.list(refresh);
    }
}
