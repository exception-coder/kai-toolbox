package com.exceptioncoder.toolbox.aisecretary.api;

import com.exceptioncoder.toolbox.aisecretary.api.dto.AskRequest;
import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureRequest;
import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureResponse;
import com.exceptioncoder.toolbox.aisecretary.api.dto.NoteView;
import com.exceptioncoder.toolbox.aisecretary.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.aisecretary.service.CaptureService;
import com.exceptioncoder.toolbox.aisecretary.service.RecallService;
import com.exceptioncoder.toolbox.aisecretary.service.StoredFile;
import com.exceptioncoder.toolbox.aisecretary.service.VoiceTranscribeService;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/ai-secretary")
public class AiSecretaryController {

    private final CaptureService captureService;
    private final RecallService recallService;
    private final VoiceTranscribeService voiceTranscribeService;
    private final AttachmentStorageService attachmentStorageService;

    public AiSecretaryController(CaptureService captureService,
                                 RecallService recallService,
                                 VoiceTranscribeService voiceTranscribeService,
                                 AttachmentStorageService attachmentStorageService) {
        this.captureService = captureService;
        this.recallService = recallService;
        this.voiceTranscribeService = voiceTranscribeService;
        this.attachmentStorageService = attachmentStorageService;
    }

    /** 记录态：自由文本 → 分类抽取 → 落库，返回本次产出的记录。 */
    @PostMapping("/capture")
    public CaptureResponse capture(@RequestBody CaptureRequest request) {
        return captureService.capture(request.text());
    }

    /** 记录态·语音：上传音频 → ffmpeg+ASR 转文本 → 走分类落库。 */
    @PostMapping(value = "/capture/voice", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CaptureResponse captureVoice(@RequestParam("audio") MultipartFile audio) throws IOException, InterruptedException {
        String text = voiceTranscribeService.transcribe(audio);
        return captureService.capture(StringUtils.hasText(text) ? text : "（语音未识别到文字）");
    }

    /** 记录态·附件：上传文件（可带文本说明）→ 落盘 + 关联 note。 */
    @PostMapping(value = "/capture/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CaptureResponse captureUpload(@RequestParam(value = "text", required = false) String text,
                                         @RequestParam(value = "files", required = false) MultipartFile[] files)
            throws IOException {
        List<StoredFile> stored = new ArrayList<>();
        if (files != null) {
            for (MultipartFile f : files) {
                if (f != null && !f.isEmpty()) {
                    stored.add(attachmentStorageService.store(f));
                }
            }
        }
        if (!StringUtils.hasText(text) && stored.isEmpty()) {
            throw new IllegalArgumentException("文本与附件不能同时为空");
        }
        return captureService.captureWithAttachments(text, stored);
    }

    /** 时间轴：最近的记录（默认 100 条）。 */
    @GetMapping("/notes")
    public List<NoteView> notes(@RequestParam(defaultValue = "100") int limit) {
        return captureService.recent(limit);
    }

    /** 删除一条记录（连带附件）。 */
    @DeleteMapping("/notes/{id}")
    public void deleteNote(@PathVariable String id) {
        captureService.deleteNote(id);
    }

    /** 回忆态：自然语言提问 → tool-loop 查库作答；SSE 流式推每步 step + 最终 answer。 */
    @PostMapping(value = "/ask", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter ask(@RequestBody AskRequest request) {
        SseEmitter emitter = new SseEmitter(180_000L);
        recallService.ask(request.question(), emitter);
        return emitter;
    }
}
