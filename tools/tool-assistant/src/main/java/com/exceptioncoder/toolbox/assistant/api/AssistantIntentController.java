package com.exceptioncoder.toolbox.assistant.api;

import com.exceptioncoder.toolbox.assistant.domain.AssistantIntentResult;
import com.exceptioncoder.toolbox.assistant.service.AssistantIntentRouter;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 显式模式优先、AUTO 受控枚举分类的意图接口。 */
@RestController
@RequestMapping("/api/assistant/intents")
@RequireAuth
public class AssistantIntentController {

    private final AssistantIntentRouter router;

    public AssistantIntentController(AssistantIntentRouter router) {
        this.router = router;
    }

    @PostMapping("/route")
    public AssistantIntentResult route(@Valid @RequestBody RouteIntentRequest request) {
        return router.route(request.mode(), request.text());
    }

    public record RouteIntentRequest(@Pattern(regexp = "AUTO|QUESTION|BUG|SUGGESTION|DIAGNOSE") String mode,
                                     @NotBlank @Size(max = 4000) String text) {
    }
}
