package com.exceptioncoder.toolbox.webppt.api;

import com.exceptioncoder.toolbox.webppt.api.dto.DesignTokenResponse;
import com.exceptioncoder.toolbox.webppt.api.dto.PromptContent;
import com.exceptioncoder.toolbox.webppt.api.dto.SamplesResponse;
import com.exceptioncoder.toolbox.webppt.api.dto.VersionsResponse;
import com.exceptioncoder.toolbox.webppt.service.WebPptStyleService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * WebPPT 风格中心只读接口：Design Token / 生成提示词 / 版本列表 / reveal.js 落地样例。
 * 本控制器不做任何风格数据加工，全部委托给 {@link WebPptStyleService}。
 */
@RestController
@RequestMapping("/api/webppt")
public class WebPptStyleController {

    private final WebPptStyleService service;

    public WebPptStyleController(WebPptStyleService service) {
        this.service = service;
    }

    @GetMapping("/style/token")
    public DesignTokenResponse getDesignToken(@RequestParam(required = false) String version) {
        return service.getDesignToken(version);
    }

    @GetMapping(value = "/style/prompt", produces = "text/markdown;charset=UTF-8")
    public ResponseEntity<String> getPrompt(@RequestParam(required = false) String version) {
        PromptContent prompt = service.getPrompt(version);
        return ResponseEntity.ok()
                .header("X-Style-Version", prompt.getVersion())
                .body(prompt.getContent());
    }

    @GetMapping("/style/versions")
    public VersionsResponse listVersions() {
        return service.listVersions();
    }

    @GetMapping("/samples")
    public SamplesResponse listSamples() {
        return service.listSamples();
    }

    @GetMapping(value = "/samples/{sampleId}/content", produces = MediaType.TEXT_HTML_VALUE)
    public String getSampleContent(@PathVariable String sampleId) {
        return service.getSampleContent(sampleId);
    }
}
