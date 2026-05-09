package com.exceptioncoder.toolbox.docviewer.infra;

import com.exceptioncoder.toolbox.docviewer.exception.DocViewerErrorCode;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerException;
import com.exceptioncoder.toolbox.docviewer.infra.dto.RefSha;
import com.exceptioncoder.toolbox.docviewer.infra.dto.TreeFetchResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
public class GitHubClient {

    private static final Logger log = LoggerFactory.getLogger(GitHubClient.class);
    private static final String UA = "kai-toolbox-doc-viewer/1.0";
    /** GitHub 限流剩余 ≤ 此阈值时主动 short-circuit。 */
    public static final int RATE_LIMIT_THRESHOLD = 5;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper json = new ObjectMapper();

    public RefSha getRefSha(String owner, String repo, String ref, String pat) {
        URI uri = URI.create("https://api.github.com/repos/" + enc(owner) + "/" + enc(repo)
                + "/branches/" + enc(ref));
        HttpResponse<String> resp = send(buildRequest(uri, pat, null), "branches");
        if (resp.statusCode() == 404) {
            throw new DocViewerException(DocViewerErrorCode.REPO_NOT_FOUND,
                    "repo or branch not found: " + owner + "/" + repo + "@" + ref);
        }
        if (resp.statusCode() == 401 || resp.statusCode() == 403) {
            // 区分限流 vs 私库：403 + remaining=0 才是限流
            if (isRateLimited(resp)) {
                throw new DocViewerException(DocViewerErrorCode.RATE_LIMITED,
                        "github api rate limited; please add or rotate PAT");
            }
            throw new DocViewerException(DocViewerErrorCode.REPO_FORBIDDEN,
                    "no access to repo (status " + resp.statusCode() + "); private repo needs PAT");
        }
        if (resp.statusCode() != 200) {
            throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                    "branches api returned " + resp.statusCode());
        }
        try {
            JsonNode root = json.readTree(resp.body());
            String sha = root.path("commit").path("sha").asText(null);
            if (sha == null || sha.isBlank()) {
                throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                        "branches api response missing commit.sha");
            }
            return new RefSha(sha, resp.headers().firstValue("ETag").orElse(null));
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                    "failed to parse branches api response", e);
        }
    }

    public TreeFetchResult getTree(String owner, String repo, String sha, String pat) {
        return doGetTree(owner, repo, sha, pat, null);
    }

    public TreeFetchResult getTreeIfModified(String owner, String repo, String sha, String pat, String etag) {
        return doGetTree(owner, repo, sha, pat, etag);
    }

    private TreeFetchResult doGetTree(String owner, String repo, String sha, String pat, String etag) {
        URI uri = URI.create("https://api.github.com/repos/" + enc(owner) + "/" + enc(repo)
                + "/git/trees/" + enc(sha) + "?recursive=1");
        HttpResponse<String> resp = send(buildRequest(uri, pat, etag), "trees");
        int s = resp.statusCode();
        if (s == 304) return TreeFetchResult.notModified();
        if (s == 401 || s == 403) {
            if (isRateLimited(resp)) {
                Long reset = parseRateLimitReset(resp);
                return TreeFetchResult.rateLimited(reset);
            }
            throw new DocViewerException(DocViewerErrorCode.REPO_FORBIDDEN,
                    "no access to repo trees (status " + s + ")");
        }
        if (s == 404) {
            throw new DocViewerException(DocViewerErrorCode.REPO_NOT_FOUND, "tree sha not found: " + sha);
        }
        if (s != 200) {
            throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                    "trees api returned " + s);
        }
        try {
            JsonNode root = json.readTree(resp.body());
            if (root.path("truncated").asBoolean(false)) {
                throw new DocViewerException(DocViewerErrorCode.TREE_TOO_LARGE,
                        "tree exceeds GitHub recursive limit (~100k entries); use a sub-path URL");
            }
            JsonNode tree = root.path("tree");
            List<TreeFetchResult.RawTreeNode> nodes = new ArrayList<>(tree.size());
            for (JsonNode n : tree) {
                String path = n.path("path").asText();
                String type = n.path("type").asText();
                String nodeSha = n.path("sha").asText();
                Long size = n.has("size") ? n.path("size").asLong() : null;
                nodes.add(new TreeFetchResult.RawTreeNode(path, type, nodeSha, size));
            }
            // 限流软警告：剩余 ≤ 阈值时主动写一次告警，由 Service 决定是否冷却
            int remaining = parseRateLimitRemaining(resp);
            if (remaining >= 0 && remaining <= RATE_LIMIT_THRESHOLD) {
                log.warn("github rate limit nearing exhaustion: remaining={}", remaining);
            }
            return TreeFetchResult.updated(nodes, resp.headers().firstValue("ETag").orElse(null));
        } catch (IOException e) {
            throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                    "failed to parse trees api response", e);
        }
    }

    /**
     * 拉取单个文件正文。优先走 raw URL（速度快、不消耗 API 限流配额）。
     * 二进制内容（非 UTF-8 可解码）以 BINARY 标记返回；调用方据此把 content 置 null。
     */
    public RawFile fetchRaw(String owner, String repo, String refSha, String path, String pat) {
        URI uri = URI.create("https://raw.githubusercontent.com/" + enc(owner) + "/" + enc(repo)
                + "/" + enc(refSha) + "/" + encPath(path));
        HttpRequest.Builder b = HttpRequest.newBuilder(uri)
                .header("User-Agent", UA)
                .timeout(Duration.ofSeconds(20))
                .GET();
        if (pat != null && !pat.isBlank()) {
            b.header("Authorization", "token " + pat);
        }
        try {
            HttpResponse<byte[]> resp = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
            int s = resp.statusCode();
            if (s == 404) throw new DocViewerException(DocViewerErrorCode.FILE_NOT_IN_TREE,
                    "raw 404: " + path);
            if (s == 401 || s == 403) throw new DocViewerException(DocViewerErrorCode.REPO_FORBIDDEN,
                    "raw forbidden (status " + s + ")");
            if (s != 200) throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                    "raw returned " + s);
            byte[] bytes = resp.body();
            if (looksBinary(bytes, path)) {
                return new RawFile("BINARY", null, bytes.length);
            }
            return new RawFile("BLOB", new String(bytes, StandardCharsets.UTF_8), bytes.length);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                    "raw fetch failed: " + e.getMessage(), e);
        }
    }

    public record RawFile(String kind, String content, long size) {}

    // --- 内部 helpers ---

    private HttpRequest buildRequest(URI uri, String pat, String etag) {
        HttpRequest.Builder b = HttpRequest.newBuilder(uri)
                .header("User-Agent", UA)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .timeout(Duration.ofSeconds(15))
                .GET();
        if (pat != null && !pat.isBlank()) {
            b.header("Authorization", "token " + pat);
        }
        if (etag != null && !etag.isBlank()) {
            b.header("If-None-Match", etag);
        }
        return b.build();
    }

    private HttpResponse<String> send(HttpRequest req, String label) {
        try {
            return http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new DocViewerException(DocViewerErrorCode.UPSTREAM_UNAVAILABLE,
                    "github " + label + " request failed: " + e.getMessage(), e);
        }
    }

    private boolean isRateLimited(HttpResponse<?> resp) {
        return parseRateLimitRemaining(resp) == 0;
    }

    private int parseRateLimitRemaining(HttpResponse<?> resp) {
        return resp.headers().firstValue("X-RateLimit-Remaining")
                .map(s -> {
                    try { return Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return -1; }
                })
                .orElse(-1);
    }

    private Long parseRateLimitReset(HttpResponse<?> resp) {
        return resp.headers().firstValue("X-RateLimit-Reset")
                .map(s -> {
                    try { return Long.parseLong(s.trim()) * 1000L; }
                    catch (NumberFormatException e) { return null; }
                })
                .orElse(null);
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /** path 内的 / 不能编码 */
    private static String encPath(String path) {
        String[] parts = path.split("/");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('/');
            sb.append(URLEncoder.encode(parts[i], StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    /**
     * 启发式：先看后缀，再扫前 8KB 是否含 NUL 字节。命中即视作二进制。
     * markdown / 配置 / 源码均放过。
     */
    private static boolean looksBinary(byte[] bytes, String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".gif") || lower.endsWith(".pdf") || lower.endsWith(".zip")
                || lower.endsWith(".tar") || lower.endsWith(".gz") || lower.endsWith(".jar")
                || lower.endsWith(".class") || lower.endsWith(".exe") || lower.endsWith(".dll")
                || lower.endsWith(".ico") || lower.endsWith(".webp") || lower.endsWith(".mp4")
                || lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".woff")
                || lower.endsWith(".woff2") || lower.endsWith(".ttf") || lower.endsWith(".otf")) {
            return true;
        }
        int scan = Math.min(bytes.length, 8192);
        for (int i = 0; i < scan; i++) {
            if (bytes[i] == 0) return true;
        }
        return false;
    }
}
