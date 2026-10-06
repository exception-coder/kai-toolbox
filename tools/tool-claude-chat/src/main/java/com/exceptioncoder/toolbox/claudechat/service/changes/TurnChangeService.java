package com.exceptioncoder.toolbox.claudechat.service.changes;

import com.exceptioncoder.toolbox.claudechat.repository.TurnChangeRepository;
import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitStatusEntry;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import static com.exceptioncoder.toolbox.claudechat.service.changes.TurnChangeRecord.*;

/** 轮次开始/终态的只读 Git 采集；失败不改变 Agent 的执行结果。 */
@Slf4j
@Service
public class TurnChangeService {
    private static final int MAX_FILES = 200;
    private final SessionGitRepositoryService repositories;
    private final GitLogService git;
    private final TurnChangeRepository records;
    public TurnChangeService(SessionGitRepositoryService repositories, GitLogService git, TurnChangeRepository records) {
        this.repositories = repositories; this.git = git; this.records = records;
    }
    /** 开始执行前持久化现有脏文件摘要，避免结束时把原有修改算作新增变化。 */
    public void begin(String sessionId, String turnId) {
        try {
            List<String> warnings = new ArrayList<>();
            List<RepositoryChange> snapshots = new ArrayList<>();
            var refs = repositories.list(sessionId);
            if (refs.isEmpty()) warnings.add("没有可采集的 Git 仓库");
            if (refs.size() > 8) warnings.add("仓库采集限制为 8 个");
            for (var ref : refs.stream().limit(8).toList()) {
                try {
                    Path root = repositories.resolve(sessionId, ref.name());
                    String head = git.workspaceHead(root);
                    Map<String, FileStamp> baseline = stamps(root, git.workspaceEntries(root), warnings);
                    snapshots.add(new RepositoryChange(ref.name(), ref.label(), root.toString(), head, null, baseline, List.of()));
                } catch (RuntimeException exception) { warnings.add(ref.label() + "：Git 基线采集失败"); }
            }
            records.begin(sessionId, new TurnChangeRecord(turnId, System.currentTimeMillis(), null, null,
                    "RUNNING", snapshots, warnings));
        } catch (RuntimeException exception) { log.warn("轮次变更基线未保存 session={} turn={}", sessionId, turnId); }
    }
    /** 收口成功、失败或中断轮次；重复收口不会重采集当前工作区。 */
    public void finish(String sessionId, String turnId, String stopReason) {
        try {
            var existing = records.find(sessionId, turnId);
            if (existing.isEmpty() || existing.get().endedAt() != null) return;
            var record = existing.get();
            List<String> warnings = new ArrayList<>(record.warnings());
            List<RepositoryChange> results = new ArrayList<>();
            for (var before : record.repositories()) {
                try {
                    Path root = repositories.resolve(sessionId, before.selection());
                    if (!root.toString().equals(before.root())) throw new IllegalStateException("仓库身份改变");
                    String head = git.workspaceHead(root);
                    Map<String, FileStamp> after = stamps(root, git.workspaceEntries(root), warnings);
                    Map<String, FileChange> files = new LinkedHashMap<>();
                    if (before.beforeHead() != null && head != null && !before.beforeHead().equals(head)) {
                        var committed = git.workspaceCommittedEntries(root, before.beforeHead(), head);
                        if (committed.size() > MAX_FILES) warnings.add(before.label() + "：提交清单超过 200 条");
                        for (var entry : committed.stream().limit(MAX_FILES).toList()) {
                            files.put(entry.path(), new FileChange(entry.path(), entry.origPath(), entry.x(),
                                    before.baseline().containsKey(entry.path()) ? "COMMIT_PREEXISTING" : "COMMIT"));
                        }
                    } else if (before.beforeHead() == null && head != null) {
                        warnings.add(before.label() + "：开始时没有 HEAD，首个提交的完整清单未采集");
                    }
                    Set<String> candidates = new LinkedHashSet<>(before.baseline().keySet());
                    candidates.addAll(after.keySet());
                    long[] budget = {32L * 1024 * 1024};
                    for (String path : candidates.stream().limit(MAX_FILES).toList()) {
                        var old = before.baseline().get(path);
                        var now = after.get(path);
                        String digest = now == null ? digest(root, path, budget, warnings) : now.digest();
                        if (digest == null || (old != null && old.digest() == null)) continue;
                        if (old != null && Objects.equals(old.digest(), digest)) continue;
                        if (old == null && now == null) continue;
                        files.put(path, new FileChange(path, now == null ? null : now.originalPath(),
                                "MISSING".equals(digest) ? "D" : now == null ? "M" : now.status(), "WORKSPACE"));
                    }
                    if (candidates.size() > MAX_FILES) warnings.add(before.label() + "：工作区清单超过 200 条");
                    results.add(new RepositoryChange(before.selection(), before.label(), before.root(), before.beforeHead(), head,
                            Map.of(), List.copyOf(files.values())));
                } catch (RuntimeException exception) {
                    warnings.add(before.label() + "：结束采集失败或仓库已解除关联");
                }
            }
            records.finish(sessionId, new TurnChangeRecord(turnId, record.startedAt(), System.currentTimeMillis(), stopReason,
                    warnings.isEmpty() ? "COMPLETE" : "PARTIAL", results, warnings));
        } catch (RuntimeException exception) { log.warn("轮次变更终态未保存 session={} turn={}", sessionId, turnId); }
    }
    /** 验证当前会话目录权限后查询历史；不重新扫描历史轮次。 */
    public List<TurnChangeRecord> list(String sessionId, String query, String turnId, int offset) {
        repositories.list(sessionId);
        return records.list(sessionId, query, turnId, offset).stream().map(record -> new TurnChangeRecord(record.turnId(),
                record.startedAt(), record.endedAt(), record.stopReason(), record.state(), record.repositories().stream()
                .map(repo -> new RepositoryChange(repo.selection(), repo.label(), repo.root(), repo.beforeHead(), repo.afterHead(),
                        Map.of(), repo.files())).toList(), record.warnings())).toList();
    }
    private Map<String, FileStamp> stamps(Path root, List<GitStatusEntry> entries, List<String> warnings) {
        Map<String, FileStamp> result = new LinkedHashMap<>();
        if (entries.size() > MAX_FILES) warnings.add("脏文件基线超过 200 条，记录不完整");
        long[] budget = {32L * 1024 * 1024};
        for (var entry : entries.stream().limit(MAX_FILES).toList()) {
            result.put(entry.path(), new FileStamp(digest(root, entry.path(), budget, warnings),
                    entry.x().strip().isEmpty() ? entry.y() : entry.x(), entry.origPath()));
        }
        return result;
    }
    private String digest(Path root, String relative, long[] budget, List<String> warnings) {
        try {
            Path file = root.resolve(relative).normalize();
            if (!file.startsWith(root)) throw new IllegalArgumentException("路径越界");
            for (Path component = file; component != null && !component.equals(root); component = component.getParent()) {
                if (Files.isSymbolicLink(component) || (Files.exists(component) && !component.toRealPath().startsWith(root.toRealPath()))) {
                    throw new IllegalArgumentException("链接不参与摘要");
                }
            }
            if (!Files.exists(file, LinkOption.NOFOLLOW_LINKS)) return "MISSING";
            long size = Files.size(file);
            if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || size > 8L * 1024 * 1024 || size > budget[0]) {
                throw new IllegalArgumentException("摘要超过采集上限");
            }
            budget[0] -= size;
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            try (var input = Files.newInputStream(file)) {
                byte[] bytes = new byte[8192]; int count; long read = 0;
                while ((count = input.read(bytes)) >= 0) {
                    read += count;
                    if (read > 8L * 1024 * 1024) throw new IllegalArgumentException("文件增长超过采集上限");
                    hash.update(bytes, 0, count);
                }
            }
            return HexFormat.of().formatHex(hash.digest());
        } catch (Exception exception) {
            if (!warnings.contains("部分文件过大、不可读或为链接，未能比较内容")) warnings.add("部分文件过大、不可读或为链接，未能比较内容");
            return null;
        }
    }
}
