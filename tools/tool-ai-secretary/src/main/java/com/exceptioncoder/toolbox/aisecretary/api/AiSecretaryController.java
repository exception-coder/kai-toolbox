package com.exceptioncoder.toolbox.aisecretary.api;

import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureRequest;
import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureResponse;
import com.exceptioncoder.toolbox.aisecretary.api.dto.NoteView;
import com.exceptioncoder.toolbox.aisecretary.service.CaptureService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ai-secretary")
public class AiSecretaryController {

    private final CaptureService captureService;

    public AiSecretaryController(CaptureService captureService) {
        this.captureService = captureService;
    }

    /** 记录态：自由文本 → 分类抽取 → 落库，返回本次产出的记录。 */
    @PostMapping("/capture")
    public CaptureResponse capture(@RequestBody CaptureRequest request) {
        return captureService.capture(request.text());
    }

    /** 时间轴：最近的记录（默认 100 条）。 */
    @GetMapping("/notes")
    public List<NoteView> notes(@RequestParam(defaultValue = "100") int limit) {
        return captureService.recent(limit);
    }
}
