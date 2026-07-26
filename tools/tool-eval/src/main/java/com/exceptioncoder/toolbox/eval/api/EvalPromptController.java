package com.exceptioncoder.toolbox.eval.api;

import com.exceptioncoder.toolbox.eval.api.dto.SavePromptRequest;
import com.exceptioncoder.toolbox.eval.domain.EvalPrompt;
import com.exceptioncoder.toolbox.eval.service.EvalPromptService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 提示词版本管理。
 * <ul>
 *   <li>{@code GET  /api/eval/prompts?key=} 某 key 的全部版本</li>
 *   <li>{@code POST /api/eval/prompts} 新增版本</li>
 *   <li>{@code POST /api/eval/prompts/{key}/activate/{version}} 切换激活版本</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/eval/prompts")
public class EvalPromptController {

    private final EvalPromptService service;

    public EvalPromptController(EvalPromptService service) {
        this.service = service;
    }

    @GetMapping
    public List<EvalPrompt> list(@RequestParam("key") String promptKey) {
        return service.listVersions(promptKey);
    }

    @PostMapping
    public ResponseEntity<EvalPrompt> add(@Valid @RequestBody SavePromptRequest req) {
        EvalPrompt p = service.addVersion(req.promptKey(), req.content(), req.note(),
                req.activate() == null || req.activate());
        return ResponseEntity.status(HttpStatus.CREATED).body(p);
    }

    @PostMapping("/{key}/activate/{version}")
    public ResponseEntity<Void> activate(@PathVariable String key, @PathVariable int version) {
        service.activate(key, version);
        return ResponseEntity.noContent().build();
    }
}
