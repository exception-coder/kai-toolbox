package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import org.springframework.web.bind.annotation.*;

@RestController
@RequireAuth
@RequestMapping("/api/fore-consult/suggestions")
public class ConsultSuggestionController {
    private final ConsultSuggestionService service;
    public ConsultSuggestionController(ConsultSuggestionService service) { this.service = service; }
    public record Normalize(String original) { }

    @GetMapping
    public ConsultSuggestion.Page list(@RequestParam(defaultValue = "0") int offset) { return service.list(offset); }

    @PostMapping("/normalize")
    public ConsultSuggestion.Draft normalize(@RequestBody Normalize request) { return service.normalize(request.original()); }

    @PostMapping
    public ConsultSuggestion submit(@RequestBody ConsultSuggestion.Submit request) {
        return service.submit(AuthContext.current().orElseThrow().userId(), request);
    }
}
