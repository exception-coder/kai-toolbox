package com.exceptioncoder.toolbox.workline.service;

import com.exceptioncoder.toolbox.workline.api.dto.EntryUpsertRequest;
import com.exceptioncoder.toolbox.workline.api.dto.EntryView;
import com.exceptioncoder.toolbox.workline.api.dto.WorklineUpsertRequest;
import com.exceptioncoder.toolbox.workline.api.dto.WorklineView;
import com.exceptioncoder.toolbox.workline.domain.Workline;
import com.exceptioncoder.toolbox.workline.domain.WorklineEntry;
import com.exceptioncoder.toolbox.workline.repository.WorklineEntryRepository;
import com.exceptioncoder.toolbox.workline.repository.WorklineRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/**
 * 工作线模块业务编排：校验工作线存在、组装出参、删除工作线时级联删其条目。
 *
 * <p>not-found 统一抛 {@link NoSuchElementException}，由
 * {@code WorklineController} 的局部 {@code @ExceptionHandler} 转 404。
 */
@Service
public class WorklineService {

    private final WorklineRepository lineRepo;
    private final WorklineEntryRepository entryRepo;

    public WorklineService(WorklineRepository lineRepo, WorklineEntryRepository entryRepo) {
        this.lineRepo = lineRepo;
        this.entryRepo = entryRepo;
    }

    // ---------- 工作线 ----------

    public List<WorklineView> listLines() {
        Map<Long, Integer> counts = entryRepo.countTopLevelGroupByLine();
        return lineRepo.findAll().stream()
                .map(w -> WorklineView.of(w, counts.getOrDefault(w.getId(), 0)))
                .toList();
    }

    public WorklineView createLine(WorklineUpsertRequest req) {
        long now = System.currentTimeMillis();
        Workline w = Workline.builder()
                .name(req.name().trim())
                .description(req.description())
                .sortOrder(0)
                .createdAt(now)
                .updatedAt(now)
                .build();
        lineRepo.insert(w);
        return WorklineView.of(w, 0);
    }

    public WorklineView updateLine(long id, WorklineUpsertRequest req) {
        Workline w = lineRepo.findById(id).orElseThrow(() -> lineNotFound(id));
        long now = System.currentTimeMillis();
        lineRepo.update(id, req.name().trim(), req.description(), now);
        w.setName(req.name().trim());
        w.setDescription(req.description());
        w.setUpdatedAt(now);
        int topLevelCount = entryRepo.countTopLevelGroupByLine().getOrDefault(id, 0);
        return WorklineView.of(w, topLevelCount);
    }

    @Transactional
    public void deleteLine(long id) {
        // 级联：先删子表条目，再删工作线本身（不裸依赖 FK CASCADE，更可控）
        entryRepo.deleteByLineId(id);
        lineRepo.delete(id);
    }

    // ---------- 条目 ----------

    public List<EntryView> listEntries(long lineId) {
        requireLine(lineId);
        List<WorklineEntry> all = entryRepo.findByLineId(lineId);
        // 按 parent 分组（all 已按 sort_order/created_at 升序，分组后的 list 保留该顺序）
        Map<Long, List<WorklineEntry>> childrenByParent = all.stream()
                .filter(e -> e.getParentId() != null)
                .collect(Collectors.groupingBy(WorklineEntry::getParentId));
        return all.stream()
                .filter(e -> e.getParentId() == null)
                .map(top -> {
                    List<EntryView> children = childrenByParent.getOrDefault(top.getId(), List.of())
                            .stream().map(EntryView::of).toList();
                    return EntryView.of(top, children);
                })
                .toList();
    }

    public EntryView createEntry(long lineId, EntryUpsertRequest req) {
        requireLine(lineId);
        Long parentId = req.parentId();
        if (parentId != null) {
            WorklineEntry parent = entryRepo.findById(parentId).orElseThrow(() -> entryNotFound(parentId));
            if (parent.getLineId() == null || parent.getLineId() != lineId) {
                throw new IllegalArgumentException("父条目不属于该工作线");
            }
            if (parent.getParentId() != null) {
                throw new IllegalArgumentException("仅支持两级，不能在明细子条目下再建子条目");
            }
        }
        long now = System.currentTimeMillis();
        WorklineEntry e = WorklineEntry.builder()
                .lineId(lineId)
                .parentId(parentId)
                .title(req.title().trim())
                .coreContent(req.coreContent())
                .achievement(req.achievement())
                .sortOrder(0)
                .createdAt(now)
                .updatedAt(now)
                .build();
        entryRepo.insert(e);
        return EntryView.of(e);
    }

    public EntryView updateEntry(long id, EntryUpsertRequest req) {
        WorklineEntry e = entryRepo.findById(id).orElseThrow(() -> entryNotFound(id));
        long now = System.currentTimeMillis();
        entryRepo.update(id, req.title().trim(), req.coreContent(), req.achievement(), now);
        e.setTitle(req.title().trim());
        e.setCoreContent(req.coreContent());
        e.setAchievement(req.achievement());
        e.setUpdatedAt(now);
        return EntryView.of(e);
    }

    @Transactional
    public void deleteEntry(long id) {
        // 若是顶层摘要条目，先删其全部明细子条目，再删自身；删不存在的 id 幂等
        entryRepo.deleteByParentId(id);
        entryRepo.delete(id);
    }

    // ---------- helpers ----------

    private void requireLine(long lineId) {
        if (!lineRepo.exists(lineId)) {
            throw lineNotFound(lineId);
        }
    }

    private static NoSuchElementException lineNotFound(long id) {
        return new NoSuchElementException("工作线不存在: " + id);
    }

    private static NoSuchElementException entryNotFound(long id) {
        return new NoSuchElementException("工作条目不存在: " + id);
    }
}
