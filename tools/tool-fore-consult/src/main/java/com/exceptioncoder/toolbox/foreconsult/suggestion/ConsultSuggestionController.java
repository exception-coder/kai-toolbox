package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import org.springframework.web.bind.annotation.*;

@RestController
@RequireAuth
@RequestMapping("/api/fore-consult/suggestions")
public class ConsultSuggestionController {
    private final ConsultSuggestionService service;
    private final ConsultSuggestionWorkRepository work;
    public ConsultSuggestionController(ConsultSuggestionService service, ConsultSuggestionWorkRepository work) { this.service = service; this.work = work; }
    public record Normalize(String original) { }

    @GetMapping
    public ConsultSuggestion.Page list(@RequestParam(defaultValue = "0") int offset) { return service.list(offset); }

    @PostMapping("/normalize")
    public ConsultSuggestion.Draft normalize(@RequestBody Normalize request) { return service.normalize(request.original()); }

    @PostMapping
    public ConsultSuggestion submit(@RequestBody ConsultSuggestion.Submit request) {
        return service.submit(AuthContext.current().orElseThrow().userId(), request);
    }

    @PostMapping("/{id}/retry-review")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void retryReview(@PathVariable String id) {
        if (!work.retryReview(id, AuthContext.current().orElseThrow().userId())) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "仅可重试本人审核失败的建议，请刷新清单核对状态");
        }
    }
}
