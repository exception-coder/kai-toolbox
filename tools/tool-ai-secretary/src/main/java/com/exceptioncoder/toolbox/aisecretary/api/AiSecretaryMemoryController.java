package com.exceptioncoder.toolbox.aisecretary.api;

import com.exceptioncoder.toolbox.aisecretary.api.dto.MemoryView;
import com.exceptioncoder.toolbox.aisecretary.domain.MemoryCategory;
import com.exceptioncoder.toolbox.aisecretary.domain.MemoryStatus;
import com.exceptioncoder.toolbox.aisecretary.service.MemoryService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * 长期记忆 / 用户画像管理：列出 / 手动增 / 改(含确认) / 删。
 * 抽取(LLM 提议)在 capture/recall 后异步进行，落 proposed；本控制器只管展示与人工裁决。
 */
@RestController
@RequestMapping("/api/ai-secretary/memory")
public class AiSecretaryMemoryController {

    private final MemoryService memory;

    public AiSecretaryMemoryController(MemoryService memory) {
        this.memory = memory;
    }

    /** 按状态列出：status=active（默认）/ proposed / archived。 */
    @GetMapping
    public List<MemoryView> list(@RequestParam(defaultValue = "active") String status) {
        return memory.listByStatus(MemoryStatus.fromString(status)).stream().map(MemoryView::of).toList();
    }

    @PostMapping
    public MemoryView add(@RequestBody MemoryRequest req) {
        MemoryCategory cat = MemoryCategory.fromLabel(req.category());
        if (cat == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "非法类目：" + req.category());
        }
        try {
            return MemoryView.of(memory.manualAdd(cat, req.key(), req.value(), req.detail(),
                    req.pinned() != null && req.pinned()));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    /** 局部更新；status=ACTIVE 即确认一条 proposed。 */
    @PutMapping("/{id}")
    public MemoryView update(@PathVariable String id, @RequestBody MemoryRequest req) {
        MemoryCategory cat = req.category() == null ? null : MemoryCategory.fromLabel(req.category());
        MemoryStatus status = req.status() == null ? null : MemoryStatus.fromString(req.status());
        try {
            return MemoryView.of(memory.update(id, cat, req.key(), req.value(), req.detail(), req.pinned(), status));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        memory.delete(id);
    }

    /** 增改请求体：category/key/value/detail/pinned/status，均可空（更新时只改非空）。 */
    public record MemoryRequest(
            String category,
            String key,
            String value,
            String detail,
            Boolean pinned,
            String status) {
    }
}
