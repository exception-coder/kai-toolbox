package com.exceptioncoder.toolbox.java8gu.api;

import com.exceptioncoder.toolbox.java8gu.api.dto.AskRequest;
import com.exceptioncoder.toolbox.java8gu.api.dto.EnrichRequest;
import com.exceptioncoder.toolbox.java8gu.service.Java8guAskService;
import com.exceptioncoder.toolbox.java8gu.service.Java8guEnrichService;
import com.exceptioncoder.toolbox.java8gu.service.Java8guRagService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
    private final Java8guEnrichService enrichService;

    public Java8guController(Java8guRagService ragService,
                            Java8guAskService askService,
                            Java8guEnrichService enrichService) {
        this.ragService = ragService;
        this.askService = askService;
        this.enrichService = enrichService;
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
        askService.ask(request.question(), request.categoryId(), emitter);
        return emitter;
    }

    /**
     * 知识补全：题目 markdown → 结构化补全（图解/面试问答/易错点/深度讲解）。
     *
     * @param cacheOnly true 时只读缓存（进题页自动调用，绝不触发 LLM）；
     *                  false（默认）时 cache-first：命中直接返回，miss 才调 LLM。
     */
    @PostMapping("/enrich")
    public Map<String, Object> enrich(@RequestBody EnrichRequest request,
                                      @RequestParam(name = "cacheOnly", defaultValue = "false") boolean cacheOnly) {
        return cacheOnly
                ? enrichService.peek(request.id(), request.markdown())
                : enrichService.enrich(request.id(), request.markdown());
    }
}
