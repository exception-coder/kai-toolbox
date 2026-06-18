package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.domain.Memory;
import com.exceptioncoder.toolbox.aisecretary.domain.MemoryCategory;
import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.domain.NoteCategory;
import com.exceptioncoder.toolbox.aisecretary.repository.MemoryRepository;
import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 确定性拼「用户背景」块，注入 capture/recall 的 system context。
 *
 * <p>由代码按「类别 + pinned + 时效」选取，**不让 LLM 决定记什么/读什么**：
 * 偏好/禁区取 active 全量（限条数），核心人物 pinned 优先 top-N，
 * 近期重要事项从 ai_secretary_note（open 的待办/日程）**派生**——不新建存储。
 * 全空时返回空串（注入块为空，prompt 不受影响）。
 */
@Service
public class MemoryContextBuilder {

    private static final int MAX_PREF = 20;
    private static final int MAX_BOUNDARY = 20;
    private static final int MAX_PERSON = 10;
    private static final int MAX_SALIENT = 6;
    private static final int MAX_CHARS = 1500;

    private final MemoryRepository memoryRepo;
    private final NoteRepository noteRepo;

    public MemoryContextBuilder(MemoryRepository memoryRepo, NoteRepository noteRepo) {
        this.memoryRepo = memoryRepo;
        this.noteRepo = noteRepo;
    }

    /** 拼用户背景块；无内容返回空串。 */
    public String build() {
        List<Memory> prefs = memoryRepo.findActiveByCategory(MemoryCategory.PREFERENCE, MAX_PREF);
        List<Memory> boundaries = memoryRepo.findActiveByCategory(MemoryCategory.BOUNDARY, MAX_BOUNDARY);
        List<Memory> persons = memoryRepo.findActiveByCategory(MemoryCategory.PERSON, MAX_PERSON);
        List<String> salient = recentSalient();

        if (prefs.isEmpty() && boundaries.isEmpty() && persons.isEmpty() && salient.isEmpty()) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("【用户背景（系统长期记忆，作答/整理时参考；这里没有的不要编造）】\n");
        appendList(sb, "偏好", prefs);
        appendList(sb, "禁区（务必遵守）", boundaries);
        appendPersons(sb, persons);
        if (!salient.isEmpty()) {
            sb.append("近期重要事项：");
            sb.append(String.join("；", salient));
            sb.append('\n');
        }

        String out = sb.toString();
        return out.length() <= MAX_CHARS ? out : out.substring(0, MAX_CHARS);
    }

    private void appendList(StringBuilder sb, String title, List<Memory> items) {
        if (items.isEmpty()) {
            return;
        }
        sb.append(title).append('：');
        List<String> parts = new ArrayList<>(items.size());
        for (Memory m : items) {
            parts.add(m.key() + "—" + m.value());
        }
        sb.append(String.join("；", parts)).append('\n');
    }

    private void appendPersons(StringBuilder sb, List<Memory> persons) {
        if (persons.isEmpty()) {
            return;
        }
        sb.append("核心人物：");
        List<String> parts = new ArrayList<>(persons.size());
        for (Memory m : persons) {
            String rel = m.detail() == null || m.detail().isBlank() ? "" : "（" + m.detail() + "）";
            parts.add(m.key() + rel + "：" + m.value());
        }
        sb.append(String.join("；", parts)).append('\n');
    }

    /** 近期重要事项 = ai_secretary_note 中 open 的待办 + 日程（派生，不入 memory 表）。 */
    private List<String> recentSalient() {
        List<String> out = new ArrayList<>();
        for (Note n : noteRepo.findTodos("open", MAX_SALIENT)) {
            out.add("[待办] " + n.title());
        }
        for (Note n : noteRepo.search(null, NoteCategory.SCHEDULE.name(), null, null, MAX_SALIENT)) {
            out.add("[日程] " + n.title());
        }
        return out.size() > MAX_SALIENT ? out.subList(0, MAX_SALIENT) : out;
    }
}
