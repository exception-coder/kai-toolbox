package com.exceptioncoder.toolbox.java8gu.api;

import com.exceptioncoder.toolbox.java8gu.api.dto.AskRequest;
import com.exceptioncoder.toolbox.java8gu.service.Java8guAskService;
import com.exceptioncoder.toolbox.java8gu.service.Java8guRagService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/**
 * Java 八股复习秘书 API：批量入库 / 自检 / 复习问答（SSE）。
 */
@RestController
@RequestMapping("/api/java8gu")
public class Java8guController {

    private final Java8guRagService ragService;
    private final Java8guAskService askService;

    public Java8guController(Java8guRagService ragService, Java8guAskService askService) {
        this.ragService = ragService;
        this.askService = askService;
    }

    /** RAG 自检：enabled / 集合是否存在 / 已索引点数 / usable。 */
    @GetMapping("/rag/status")
    public Map<String, Object> ragStatus() {
        return ragService.status();
    }

    /** 批量入库（确定性 ETL）：读卡片全量重建向量索引，返回入库条数 + 重建后状态。 */
    @PostMapping("/rag/reindex")
    public Map<String, Object> ragReindex() {
        return ragService.reindex();
    }

    /** 复习问答：自然语言提问 → 代码检索卡片 → SSE 推召回明细 + 据卡片作答。 */
    @PostMapping(value = "/ask", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter ask(@RequestBody AskRequest request) {
        SseEmitter emitter = new SseEmitter(180_000L);
        askService.ask(request.question(), emitter);
        return emitter;
    }
}
