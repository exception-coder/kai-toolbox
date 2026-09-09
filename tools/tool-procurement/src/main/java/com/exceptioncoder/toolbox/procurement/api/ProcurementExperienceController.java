package com.exceptioncoder.toolbox.procurement.api;

import com.exceptioncoder.toolbox.procurement.service.ProcurementExperienceService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/procurement/experiences")
public class ProcurementExperienceController {
    private final ProcurementExperienceService service;
    public ProcurementExperienceController(ProcurementExperienceService service) { this.service = service; }
    @GetMapping public JsonNode catalog() { return service.catalog(); }
    @PostMapping("/regressions") public JsonNode regress() { return service.regress(); }
    @GetMapping("/regressions") public List<JsonNode> history() { return service.history(); }
}
