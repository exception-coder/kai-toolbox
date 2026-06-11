package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.domain.ExpenseSummary;
import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.domain.NoteCategory;
import com.exceptioncoder.toolbox.aisecretary.domain.TimeBucket;
import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import dev.langchain4j.agent.tool.Tool;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 回忆态暴露给 LLM 的结构化工具。三件事都用确定性 SQL 实现，LLM 只负责"听懂该调哪个 + 填参"。
 *
 * <p>注意：{@code @Tool} 的描述是**运行时路由依据**（模型靠它选工具），不是给人看的注释，
 * 故写得尽量清楚、含参数取值与可空说明。
 */
@Service
public class NoteTools {

    private final NoteRepository repo;

    public NoteTools(NoteRepository repo) {
        this.repo = repo;
    }

    @Tool("按关键字、类目、时间范围检索用户记过的笔记/事项。"
            + "keyword 关键字可空；category 取值：待办/日程/开销/想法/笔记/未分类，可空；"
            + "timeRange 从枚举里选最贴近用户说法的一项（如『最近』→LAST_7_DAYS、『这个月』→THIS_MONTH、"
            + "『上周』→LAST_WEEK），不限时间用 ALL。返回匹配的记录列表。")
    public String searchNotes(String keyword, String category, TimeBucket timeRange) {
        ZoneId zone = ZoneId.systemDefault();
        TimeBucket.Range range = (timeRange == null) ? null : timeRange.toRange(zone);
        String categoryName = StringUtils.hasText(category)
                ? NoteCategory.fromLabel(category).name()
                : null;
        List<Note> rows = repo.search(
                emptyToNull(keyword), categoryName,
                range == null ? null : range.fromMs(),
                range == null ? null : range.toMs(),
                20);
        String out = rows.isEmpty()
                ? "（无匹配记录）"
                : rows.stream().map(NoteTools::line).collect(Collectors.joining("\n"));
        RecallContext.emit(new RecallStep("searchNotes", argDesc(keyword, category, timeRange), rows.size() + " 条"));
        return out;
    }

    @Tool("统计某时间范围内（及可选关键字）的开销总额与笔数。"
            + "timeRange 从枚举里选最贴近用户说法的一项（如『最近』→LAST_7_DAYS、『这个月』→THIS_MONTH），"
            + "不限时间用 ALL；keyword 类目关键字如 吃饭，可空。")
    public String aggregateExpense(TimeBucket timeRange, String keyword) {
        ZoneId zone = ZoneId.systemDefault();
        TimeBucket.Range range = (timeRange == null) ? null : timeRange.toRange(zone);
        ExpenseSummary summary = repo.sumExpense(
                emptyToNull(keyword),
                range == null ? null : range.fromMs(),
                range == null ? null : range.toMs());
        String out = String.format("共 ¥%.2f，%d 笔", summary.total(), summary.count());
        RecallContext.emit(new RecallStep("aggregateExpense", argDesc(keyword, null, timeRange), out));
        return out;
    }

    @Tool("列出待办事项。status 取值 open（未完成，默认）或 done（已完成），可空。")
    public String listTodos(String status) {
        String st = StringUtils.hasText(status) ? status.trim() : "open";
        List<Note> rows = repo.findTodos(st, 30);
        String out = rows.isEmpty()
                ? "（无待办）"
                : rows.stream().map(NoteTools::line).collect(Collectors.joining("\n"));
        RecallContext.emit(new RecallStep("listTodos", "status=" + st, rows.size() + " 条"));
        return out;
    }

    private static String line(Note n) {
        StringBuilder b = new StringBuilder("• [").append(n.category().label()).append("] ").append(n.title());
        if (n.dueTime() != null) {
            b.append(" @").append(n.dueTime());
        }
        if (n.amount() != null) {
            b.append(" ¥").append(n.amount());
        }
        return b.toString();
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private static String argDesc(String keyword, String category, TimeBucket timeRange) {
        List<String> parts = new ArrayList<>();
        if (StringUtils.hasText(keyword)) {
            parts.add("keyword=" + keyword);
        }
        if (StringUtils.hasText(category)) {
            parts.add("category=" + category);
        }
        if (timeRange != null) {
            parts.add("timeRange=" + timeRange);
        }
        return String.join(", ", parts);
    }
}
