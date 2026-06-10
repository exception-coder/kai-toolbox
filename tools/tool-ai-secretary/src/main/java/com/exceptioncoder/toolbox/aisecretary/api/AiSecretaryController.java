package com.exceptioncoder.toolbox.aisecretary.api;

import com.exceptioncoder.toolbox.aisecretary.api.dto.AskRequest;
import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureRequest;
import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureResponse;
import com.exceptioncoder.toolbox.aisecretary.api.dto.NoteView;
import com.exceptioncoder.toolbox.aisecretary.service.CaptureService;
import com.exceptioncoder.toolbox.aisecretary.service.RecallService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/ai-secretary")
public class AiSecretaryController {

    private final CaptureService captureService;
    private final RecallService recallService;

    public AiSecretaryController(CaptureService captureService, RecallService recallService) {
        this.captureService = captureService;
        this.recallService = recallService;
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

    /** 回忆态：自然语言提问 → tool-loop 查库作答；SSE 流式推每步 step + 最终 answer。 */
    @PostMapping(value = "/ask", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter ask(@RequestBody AskRequest request) {
        SseEmitter emitter = new SseEmitter(180_000L);
        recallService.ask(request.question(), emitter);
        return emitter;
    }
}
