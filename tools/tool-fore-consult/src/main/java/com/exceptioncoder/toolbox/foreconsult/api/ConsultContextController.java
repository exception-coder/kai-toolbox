package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultResourceAccess;
import com.exceptioncoder.toolbox.llm.spi.ConsultationHistoryReader;
import org.springframework.web.bind.annotation.*;

/** Signed runtime identity scopes history reads; callers cannot choose another consultation. */
@RestController
@RequestMapping("/api/fore-consult/context/sessions")
public class ConsultContextController {
    private final ConsultResourceAccess access;
    private final ConsultSessionRepository sessions;
    private final ConsultationHistoryReader reader;
    @org.springframework.beans.factory.annotation.Autowired
    private com.exceptioncoder.toolbox.foreconsult.service.ConsultDocumentService documents;

    public ConsultContextController(ConsultResourceAccess access, ConsultSessionRepository sessions, ConsultationHistoryReader reader) {
        this.access = access;
        this.sessions = sessions;
        this.reader = reader;
    }

    @GetMapping("/{runtimeId}")
    public Object read(@PathVariable String runtimeId,
            @RequestHeader(value = "X-Consult-Resource-Token", required = false) String token,
            @RequestParam(defaultValue = "0") int offset, @RequestParam(defaultValue = "16000") int maxChars) {
        access.require(runtimeId, token);
        var consultation = sessions.findByDevSessionId(runtimeId).orElseThrow(() -> new IllegalArgumentException("未关联咨询会话"));
        var page = reader.read(runtimeId, offset, maxChars);
        var result = new java.util.LinkedHashMap<String, Object>();
        result.put("offset", page.offset()); result.put("nextOffset", page.nextOffset());
        result.put("complete", page.complete()); result.put("text", page.text()); result.put("gap", page.gap());
        try { result.put("documents", documents.list(consultation.getSessionId())); }
        catch (java.io.IOException error) { result.put("documentGap", "生成文件目录暂时无法读取，不能宣称文件已恢复"); }
        return result;
    }
}
