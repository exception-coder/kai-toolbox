package com.exceptioncoder.toolbox.docviewer.service;

import com.exceptioncoder.toolbox.docviewer.api.dto.FileDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.RefreshOutcomeDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.SourceDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.TreeNodeDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.TreeResponseDTO;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerErrorCode;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerException;
import com.exceptioncoder.toolbox.docviewer.infra.GitHubClient;
import com.exceptioncoder.toolbox.docviewer.infra.GitHubUrlParser;
import com.exceptioncoder.toolbox.docviewer.infra.dto.GitHubCoord;
import com.exceptioncoder.toolbox.docviewer.infra.dto.RefSha;
import com.exceptioncoder.toolbox.docviewer.infra.dto.TreeFetchResult;
import com.exceptioncoder.toolbox.docviewer.repository.DocCacheRepository;
import com.exceptioncoder.toolbox.docviewer.repository.entity.DocFileCache;
import com.exceptioncoder.toolbox.docviewer.repository.entity.DocSource;
import com.exceptioncoder.toolbox.docviewer.repository.entity.DocTreeNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DocViewerService {

    private static final Logger log = LoggerFactory.getLogger(DocViewerService.class);

    private final GitHubClient github;
    private final DocCacheRepository repo;
    private final ConcurrentHashMap<String, Object> sourceLocks = new ConcurrentHashMap<>();
    private final SecureRandom rnd = new SecureRandom();

    public DocViewerService(GitHubClient github, DocCacheRepository repo) {
        this.github = github;
        this.repo = repo;
    }

    /** 添加或返回已有文档源；首次添加时同步拉取整树。 */
    public SourceDTO createOrGetSource(String url, String pat, String alias) {
        GitHubCoord coord = GitHubUrlParser.parse(url);

        Optional<DocSource> existing = repo.findSourceByCoord(
                coord.owner(), coord.repo(), coord.ref(), coord.subPath());
        if (existing.isPresent()) {
            return SourceDTO.of(existing.get());
        }

        RefSha refSha = github.getRefSha(coord.owner(), coord.repo(), coord.ref(), pat);
        TreeFetchResult tree = github.getTree(coord.owner(), coord.repo(), refSha.sha(), pat);
        if (tree.outcome() == TreeFetchResult.Outcome.RATE_LIMITED) {
            throw new DocViewerException(DocViewerErrorCode.RATE_LIMITED,
                    "github rate limited; cannot create source without initial tree");
        }

        long now = System.currentTimeMillis();
        DocSource s = DocSource.builder()
                .id("src_" + randomShortId())
                .owner(coord.owner())
                .repo(coord.repo())
                .refName(coord.ref())
                .subPath(coord.subPath())
                .refSha(refSha.sha())
                .alias(deriveAlias(alias, coord))
                .pat(blankToNull(pat))
                .treeETag(tree.etag())
                .rateLimitUntil(null)
                .lastRefreshedAt(now)
                .createdAt(now)
                .build();
        repo.insertSource(s);
        repo.replaceTreeCache(s.getId(),
                materializeTree(s.getId(), coord.subPath(), tree.nodes()));
        return SourceDTO.of(s);
    }

    public List<SourceDTO> listSources() {
        return repo.listAllSources().stream().map(SourceDTO::of).toList();
    }

    public void deleteSource(String sourceId) {
        DocSource s = requireSource(sourceId);
        repo.deleteSource(s.getId());
    }

    /** 手动刷新该源的树。串行化，不会重复回源。 */
    public RefreshOutcomeDTO refreshTree(String sourceId) {
        synchronized (lockOf(sourceId)) {
            DocSource s = requireSource(sourceId);
            long now = System.currentTimeMillis();

            if (s.getRateLimitUntil() != null && s.getRateLimitUntil() > now) {
                return outcome(s, "COOLDOWN", true);
            }

            // 先解析最新 ref → sha；若 ref 漂了，sha 与缓存不同就退化为强制拉
            RefSha latest;
            try {
                latest = github.getRefSha(s.getOwner(), s.getRepo(), s.getRefName(), s.getPat());
            } catch (DocViewerException e) {
                if (e.getCode() == DocViewerErrorCode.RATE_LIMITED) {
                    s.setRateLimitUntil(now + 60_000); // 至少冷却 1 分钟
                    repo.updateSourceRateLimitUntil(s.getId(), s.getRateLimitUntil());
                    return outcome(s, "RATE_LIMITED", true);
                }
                throw e;
            }

            String etag = latest.sha().equals(s.getRefSha()) ? s.getTreeETag() : null;
            TreeFetchResult tree = github.getTreeIfModified(
                    s.getOwner(), s.getRepo(), latest.sha(), s.getPat(), etag);

            switch (tree.outcome()) {
                case NOT_MODIFIED -> {
                    repo.updateSourceLastRefreshed(s.getId(), now);
                    s.setLastRefreshedAt(now);
                    return outcome(s, "NOT_MODIFIED", false);
                }
                case UPDATED -> {
                    repo.replaceTreeCache(s.getId(),
                            materializeTree(s.getId(), s.getSubPath(), tree.nodes()));
                    repo.updateSourceRefAndETag(s.getId(), latest.sha(), tree.etag(), now);
                    s.setRefSha(latest.sha());
                    s.setTreeETag(tree.etag());
                    s.setLastRefreshedAt(now);
                    s.setRateLimitUntil(null);
                    repo.updateSourceRateLimitUntil(s.getId(), null);
                    return outcome(s, "UPDATED", false);
                }
                case RATE_LIMITED -> {
                    Long until = tree.rateLimitResetMillis() != null ? tree.rateLimitResetMillis() : now + 60_000;
                    repo.updateSourceRateLimitUntil(s.getId(), until);
                    s.setRateLimitUntil(until);
                    return outcome(s, "RATE_LIMITED", true);
                }
                default -> throw new IllegalStateException("unexpected outcome " + tree.outcome());
            }
        }
    }

    public TreeResponseDTO getTree(String sourceId) {
        DocSource s = requireSource(sourceId);
        boolean rateLimited = s.getRateLimitUntil() != null
                && s.getRateLimitUntil() > System.currentTimeMillis();
        List<TreeNodeDTO> nodes = repo.listTreeNodes(s.getId()).stream()
                .map(TreeNodeDTO::of).toList();
        return TreeResponseDTO.builder()
                .sourceId(s.getId())
                .ref(s.getRefName())
                .refSha(s.getRefSha())
                .rateLimited(rateLimited)
                .nodes(nodes)
                .build();
    }

    public FileDTO getFile(String sourceId, String path) {
        DocSource s = requireSource(sourceId);
        DocTreeNode node = repo.findTreeNode(s.getId(), path)
                .orElseThrow(() -> new DocViewerException(DocViewerErrorCode.FILE_NOT_IN_TREE,
                        "file not in cached tree: " + path + " (try refresh)"));
        if ("TREE".equals(node.getKind())) {
            throw new DocViewerException(DocViewerErrorCode.FILE_NOT_IN_TREE,
                    "path is a directory, not a file: " + path);
        }
        if ("BINARY".equals(node.getKind())) {
            return FileDTO.builder()
                    .sourceId(s.getId())
                    .path(path)
                    .sha(node.getSha())
                    .kind("BINARY")
                    .size(node.getSize() == null ? 0 : node.getSize())
                    .content(null)
                    .rawBaseUrl(buildRawBaseUrl(s))
                    .build();
        }

        synchronized (lockOf(sourceId + ":file:" + node.getSha())) {
            Optional<DocFileCache> cached = repo.findFileBySha(node.getSha());
            if (cached.isPresent()) {
                DocFileCache c = cached.get();
                return FileDTO.builder()
                        .sourceId(s.getId())
                        .path(path)
                        .sha(c.getSha())
                        .kind(c.getKind())
                        .size(c.getSize())
                        .content(c.getContent())
                        .rawBaseUrl(buildRawBaseUrl(s))
                        .build();
            }
            GitHubClient.RawFile raw = github.fetchRaw(
                    s.getOwner(), s.getRepo(), s.getRefSha(), path, s.getPat());
            DocFileCache f = DocFileCache.builder()
                    .sha(node.getSha())
                    .kind(raw.kind())
                    .size(raw.size())
                    .content(raw.content())
                    .cachedAt(System.currentTimeMillis())
                    .build();
            repo.upsertFile(f);
            return FileDTO.builder()
                    .sourceId(s.getId())
                    .path(path)
                    .sha(f.getSha())
                    .kind(f.getKind())
                    .size(f.getSize())
                    .content(f.getContent())
                    .rawBaseUrl(buildRawBaseUrl(s))
                    .build();
        }
    }

    // --- helpers ---

    private DocSource requireSource(String id) {
        return repo.findSourceById(id)
                .orElseThrow(() -> new DocViewerException(DocViewerErrorCode.SOURCE_NOT_FOUND,
                        "source not found: " + id));
    }

    private Object lockOf(String key) {
        return sourceLocks.computeIfAbsent(key, k -> new Object());
    }

    private RefreshOutcomeDTO outcome(DocSource s, String tag, boolean rateLimited) {
        return RefreshOutcomeDTO.builder()
                .id(s.getId())
                .outcome(tag)
                .treeETag(s.getTreeETag())
                .lastRefreshedAt(s.getLastRefreshedAt())
                .rateLimitUntil(s.getRateLimitUntil())
                .rateLimited(rateLimited)
                .build();
    }

    /**
     * 把 GitHub trees API 节点转换为本地 DocTreeNode。
     * 仅保留 subPath 之下的节点，并把 path 切掉 subPath 前缀，得到「以 subPath 为根」的相对路径。
     */
    private List<DocTreeNode> materializeTree(String sourceId, String subPath,
                                              List<TreeFetchResult.RawTreeNode> raw) {
        String prefix = subPath == null || subPath.isBlank() ? "" : subPath + "/";
        List<DocTreeNode> result = new ArrayList<>(raw.size());
        for (TreeFetchResult.RawTreeNode n : raw) {
            String absPath = n.path();
            if (!prefix.isEmpty() && !absPath.startsWith(prefix) && !absPath.equals(subPath)) {
                continue;
            }
            String rel = prefix.isEmpty() ? absPath
                    : (absPath.equals(subPath) ? "" : absPath.substring(prefix.length()));
            if (rel.isEmpty()) continue;

            String kind;
            if ("tree".equals(n.type())) kind = "TREE";
            else if ("blob".equals(n.type())) {
                kind = looksMarkdownish(rel) ? "BLOB" : guessBinaryByExt(rel) ? "BINARY" : "BLOB";
            } else continue; // submodule / commit 不展示

            int slash = rel.lastIndexOf('/');
            String name = slash < 0 ? rel : rel.substring(slash + 1);
            String parent = slash < 0 ? "" : rel.substring(0, slash);
            int depth = (int) rel.chars().filter(c -> c == '/').count();
            result.add(DocTreeNode.builder()
                    .sourceId(sourceId)
                    .path(rel)
                    .name(name)
                    .kind(kind)
                    .sha(n.sha())
                    .size(n.size())
                    .parentPath(parent)
                    .depth(depth)
                    .build());
        }
        return result;
    }

    private boolean looksMarkdownish(String path) {
        String lower = path.toLowerCase();
        return lower.endsWith(".md") || lower.endsWith(".markdown")
                || lower.endsWith(".txt") || lower.endsWith(".mdx");
    }

    private boolean guessBinaryByExt(String path) {
        String lower = path.toLowerCase();
        return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".gif") || lower.endsWith(".pdf") || lower.endsWith(".zip")
                || lower.endsWith(".webp") || lower.endsWith(".ico") || lower.endsWith(".woff")
                || lower.endsWith(".woff2") || lower.endsWith(".ttf");
    }

    private String buildRawBaseUrl(DocSource s) {
        String prefix = s.getSubPath() == null || s.getSubPath().isBlank() ? "" : s.getSubPath() + "/";
        return "https://raw.githubusercontent.com/" + s.getOwner() + "/" + s.getRepo()
                + "/" + s.getRefSha() + "/" + prefix;
    }

    private String deriveAlias(String alias, GitHubCoord coord) {
        if (alias != null && !alias.isBlank()) return alias.trim();
        return coord.subPath() == null || coord.subPath().isBlank()
                ? coord.repo()
                : coord.repo() + "/" + coord.subPath();
    }

    private String randomShortId() {
        byte[] b = new byte[6];
        rnd.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte by : b) sb.append(String.format("%02x", by));
        return sb.toString();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
