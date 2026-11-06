package com.exceptioncoder.toolbox.common.git;

import org.springframework.stereotype.Service;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;

/** Bounded, read-only source and revision queries. Callers resolve the authorized project identity first. */
@Service
public class GitReviewService {
    private static final int FILE_BYTES = 512 * 1024;
    private final GitLogService git;
    private final ProjectAccess access;

    public GitReviewService(GitLogService git, ProjectAccess access) { this.git = git; this.access = access; }

    public record Entry(String path, String name, String type) { }
    public record Info(String branch, String head) { }
    public record Tree(String ref, List<Entry> entries, boolean hasMore) { }
    public record History(String ref, List<CommitInfo> commits, boolean hasMore) { }
    public record Change(String path, String oldPath, String status, String x, String y) { }
    public record Changes(String base, String target, List<Change> files) { }
    public record Content(String path, String before, String after, String status, String notice) { }
    private record Text(String value, String notice) { }

    public Info info(Path root) {
        String branch = complete(git.reviewRead(root, "branch", "--show-current")).strip();
        return new Info(branch.isEmpty() ? "游离 HEAD" : branch, head(root));
    }

    public Tree tree(Path root, String ref, String directory, int offset) {
        String path = relative(directory, true), sha = revision(root, ref);
        access.requireAllowed(root.resolve(path));
        page(offset);
        if (sha.isEmpty()) return new Tree("", List.of(), false);
        String object = path.isEmpty() ? sha : sha + ":" + path;
        List<Entry> entries = new ArrayList<>();
        for (String row : complete(git.reviewRead(root, "ls-tree", "-z", object)).split("\u0000")) {
            int tab = row.indexOf('\t');
            if (tab < 0) continue;
            String[] meta = row.substring(0, tab).split(" ");
            String name = row.substring(tab + 1);
            if (name.equalsIgnoreCase(".git")) continue;
            String type = meta[0].equals("120000") ? "link" : meta[1];
            String entryPath = path.isEmpty() ? name : path + "/" + name;
            if (access.allowed(root.resolve(entryPath))) entries.add(new Entry(entryPath, name, type));
        }
        entries.sort(Comparator.comparing((Entry e) -> !e.type().equals("tree")).thenComparing(Entry::name));
        return new Tree(sha, entries.stream().skip(offset).limit(300).toList(), entries.size() > offset + 300);
    }

    public History history(Path root, String ref, int offset) {
        page(offset);
        String sha = revision(root, ref);
        if (sha.isEmpty()) return new History("", List.of(), false);
        String raw = complete(git.reviewRead(root, "log", "--no-show-signature", "--no-color", "-n", "51",
                "--skip=" + offset, "--format=%H%x00%h%x00%an%x00%aI%x00%s%x00", sha, "--"));
        String[] fields = raw.split("\u0000", -1);
        List<CommitInfo> rows = new ArrayList<>();
        for (int i = 0; i + 4 < fields.length; i += 5) {
            String hash = fields[i].strip();
            if (hash.isEmpty()) break;
            rows.add(new CommitInfo(hash, fields[i + 1], fields[i + 2], fields[i + 3], fields[i + 4], ""));
        }
        return new History(sha, rows.stream().limit(50).toList(), rows.size() > 50);
    }

    public Changes changes(Path root, String commit) {
        String target = revision(root, commit);
        if (target.isEmpty()) return new Changes("", "", List.of());
        String[] lineage = complete(git.reviewRead(root, "rev-list", "--parents", "-n", "1", target, "--")).strip().split(" ");
        String base = lineage.length > 1 ? lineage[1] : complete(git.reviewRead(root, "hash-object", "-t", "tree", "--stdin")).strip();
        String[] parts = complete(git.reviewRead(root, "diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", "-M", base, target, "--")).split("\u0000");
        List<Change> files = new ArrayList<>();
        for (int i = 0; i + 1 < parts.length;) {
            String status = parts[i++], path = parts[i++], old = null;
            if ((status.startsWith("R") || status.startsWith("C")) && i < parts.length) { old = path; path = parts[i++]; }
            if (access.allowed(root.resolve(path))) files.add(new Change(path, old, status.substring(0, 1), "", ""));
        }
        return new Changes(base, target, files);
    }

    public Changes workspace(Path root, String layer) {
        layer(layer);
        String[] rows = complete(git.reviewRead(root, "status", "--porcelain=v1", "-z", "-uall")).split("\u0000");
        var files = new LinkedHashMap<String, Change>();
        for (int i = 0; i < rows.length; i++) {
            if (rows[i].length() < 4) continue;
            String x = rows[i].substring(0, 1), y = rows[i].substring(1, 2), path = rows[i].substring(3), old = null;
            if (x.equals("R") || x.equals("C") || y.equals("R")) old = rows[++i];
            if (!access.allowed(root.resolve(path))) continue;
            if (layer.equals("index") && (x.equals(" ") || x.equals("?"))) continue;
            if (layer.equals("worktree") && y.equals(" ")) continue;
            String status = layer.equals("index") ? x : y.equals(" ") ? x : y;
            if (status.equals("?")) status = "A";
            Change prior = files.get(path);
            files.put(path, prior == null ? new Change(path, old, status, x, y)
                    : new Change(path, prior.oldPath(), "M", prior.x(), y));
        }
        return new Changes(head(root), "WORKTREE", List.copyOf(files.values()));
    }

    public Content source(Path root, String ref, String path) {
        relative(path, false);
        String sha = revision(root, ref);
        Text text = sha.isEmpty() ? new Text("", "仓库尚无提交。未提交文件可在工作区变更查看。") : blob(root, sha, path);
        return new Content(path, "", text.value(), "", text.notice());
    }

    public Content difference(Path root, String commit, String path, String layer) {
        relative(path, false);
        boolean working = commit.equals("WORKTREE");
        Changes changes = working ? workspace(root, layer) : changes(root, commit);
        Change change = changes.files().stream().filter(f -> f.path().equals(path)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("该版本中没有此变更文件，请刷新文件列表"));
        String oldPath = change.oldPath() == null ? path : change.oldPath();
        Text before, after;
        if (!working) {
            before = change.status().equals("A") ? empty() : blob(root, changes.base(), oldPath);
            after = change.status().equals("D") ? empty() : blob(root, changes.target(), path);
        } else if (layer.equals("index")) {
            before = change.x().equals("A") ? empty() : blob(root, changes.base(), oldPath);
            after = change.x().equals("D") ? empty() : blob(root, "", path);
        } else {
            boolean fromIndex = layer.equals("worktree");
            boolean absentBefore = fromIndex ? change.x().equals("?") || change.x().equals("D")
                    : change.x().equals("?") || change.x().equals("A");
            before = absentBefore || changes.base().isEmpty() ? empty() : blob(root, fromIndex ? "" : changes.base(), oldPath);
            after = workFile(root, path);
        }
        String notice = String.join(" ", before.notice(), after.notice()).strip();
        return new Content(path, before.value(), after.value(), change.status(), notice);
    }

    private Text blob(Path root, String ref, String path) {
        relative(path, false);
        access.requireAllowed(root.resolve(path));
        String object = ref + ":" + path;
        if (!complete(git.reviewRead(root, "cat-file", "-t", object)).strip().equals("blob"))
            return new Text("", "目录或子模块不提供文件正文预览。");
        long size = Long.parseLong(complete(git.reviewRead(root, "cat-file", "-s", object)).strip());
        if (size > FILE_BYTES) return new Text("", "文件超过 512 KiB，未加载正文。请在本机查看。");
        var result = git.reviewRead(root, "cat-file", "blob", object);
        if (result.truncated()) return new Text("", "正文超过服务端读取上限，未展示不完整差异。");
        String value = result.stdout();
        if (value.indexOf('\u0000') >= 0 || value.indexOf('\uFFFD') >= 0) return new Text("", "二进制或非 UTF-8 文件，无法预览文本差异。");
        return new Text(value, "");
    }

    private Text workFile(Path root, String path) {
        try {
            Path base = root.toRealPath(), file = base.resolve(relative(path, false));
            if (!Files.exists(file)) return empty();
            Path realFile = file.toRealPath();
            if (!realFile.startsWith(base)) throw new IllegalArgumentException("文件链接超出当前项目范围");
            access.requireAllowed(realFile);
            if (!Files.isRegularFile(realFile)) return new Text("", "目录、子模块或特殊文件不提供正文预览。");
            try (var input = Files.newInputStream(realFile)) {
                byte[] bytes = input.readNBytes(FILE_BYTES + 1);
                if (bytes.length > FILE_BYTES) return new Text("", "文件超过 512 KiB，未加载正文。请在本机查看。");
                String value = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
                return value.indexOf('\u0000') >= 0 ? new Text("", "二进制文件不提供文本预览。") : new Text(value, "");
            }
        } catch (CharacterCodingException e) { return new Text("", "非 UTF-8 文件，无法预览文本差异。");
        } catch (IOException e) { throw new IllegalStateException("无法读取项目文件，请刷新后重试", e); }
    }

    private String revision(Path root, String ref) {
        if (ref == null || !(ref.equals("HEAD") || ref.matches("[a-fA-F0-9]{40}|[a-fA-F0-9]{64}")))
            throw new IllegalArgumentException("只接受当前 HEAD 或完整提交 Hash");
        if (ref.equals("HEAD")) return head(root);
        return complete(git.reviewRead(root, "rev-parse", "--verify", "--end-of-options", ref + "^{commit}")).strip();
    }

    private String head(Path root) { String head = git.workspaceHead(root); return head == null ? "" : head; }
    private static Text empty() { return new Text("", ""); }
    private static void page(int offset) { if (offset < 0 || offset > 1_000_000) throw new IllegalArgumentException("分页超出范围"); }
    private static void layer(String layer) { if (!List.of("combined", "index", "worktree").contains(layer)) throw new IllegalArgumentException("工作区比较层无效"); }
    private static String relative(String path, boolean allowEmpty) {
        if (path == null) throw new IllegalArgumentException("项目相对路径无效");
        if (path.isEmpty() && allowEmpty) return "";
        if (path.isEmpty() || path.startsWith("/") || path.contains("\\") || path.contains(":") || path.indexOf('\u0000') >= 0)
            throw new IllegalArgumentException("项目相对路径无效");
        for (String part : path.split("/", -1)) if (part.equals("..") || part.equals(".") || part.isEmpty() || part.equalsIgnoreCase(".git"))
            throw new IllegalArgumentException("不允许访问项目外路径或 Git 内部文件");
        return path;
    }
    private static String complete(GitLogService.Result result) {
        if (result.truncated()) throw new IllegalStateException("文件清单超过服务端读取上限，请缩小目录后重试");
        return result.stdout();
    }
}
