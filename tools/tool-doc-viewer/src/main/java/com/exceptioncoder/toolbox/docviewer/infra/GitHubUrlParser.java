package com.exceptioncoder.toolbox.docviewer.infra;

import com.exceptioncoder.toolbox.docviewer.exception.DocViewerErrorCode;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerException;
import com.exceptioncoder.toolbox.docviewer.infra.dto.GitHubCoord;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * 把任意 GitHub Web URL 解析成 owner/repo/ref/subPath。支持三种形态：
 * - https://github.com/{o}/{r}                       默认分支根
 * - https://github.com/{o}/{r}/tree/{ref}/{subPath}  目录形态
 * - https://github.com/{o}/{r}/blob/{ref}/{path}     单文件形态（subPath = 父目录，focusFile = 完整 path）
 *
 * 默认分支取 ref 缺省为 "main"；用户若粘 master 仓库会触发 404，由 service 层提示重填。
 */
public final class GitHubUrlParser {

    private static final String DEFAULT_REF = "main";

    private GitHubUrlParser() {}

    public static GitHubCoord parse(String urlStr) {
        if (urlStr == null || urlStr.isBlank()) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_GITHUB_URL, "url is blank");
        }
        URI uri;
        try {
            uri = new URI(urlStr.trim());
        } catch (URISyntaxException e) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_GITHUB_URL, "invalid url syntax: " + urlStr);
        }
        String host = uri.getHost();
        if (host == null || !host.equalsIgnoreCase("github.com")) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_GITHUB_URL,
                    "only github.com is supported (got " + host + ")");
        }
        String path = uri.getPath();
        if (path == null || path.isBlank()) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_GITHUB_URL, "missing path");
        }
        String[] segs = path.replaceFirst("^/+", "").replaceFirst("/+$", "").split("/");
        if (segs.length < 2) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_GITHUB_URL,
                    "expected /{owner}/{repo}, got " + path);
        }
        String owner = segs[0];
        String repo = stripGitSuffix(segs[1]);
        if (segs.length == 2) {
            return new GitHubCoord(owner, repo, DEFAULT_REF, "", null);
        }
        String marker = segs[2];
        if (!"tree".equals(marker) && !"blob".equals(marker)) {
            // 比如 /commit/、/issues/、/pulls/ 等不支持
            throw new DocViewerException(DocViewerErrorCode.INVALID_GITHUB_URL,
                    "unsupported url shape: only /tree/ or /blob/ allowed, got /" + marker);
        }
        if (segs.length < 4) {
            throw new DocViewerException(DocViewerErrorCode.INVALID_GITHUB_URL,
                    "missing ref after /" + marker + "/");
        }
        String ref = segs[3];
        String rest = segs.length > 4 ? String.join("/", java.util.Arrays.copyOfRange(segs, 4, segs.length)) : "";
        if ("blob".equals(marker)) {
            String subPath = rest.contains("/") ? rest.substring(0, rest.lastIndexOf('/')) : "";
            return new GitHubCoord(owner, repo, ref, subPath, rest);
        }
        return new GitHubCoord(owner, repo, ref, rest, null);
    }

    /** 用户可能粘 clone URL（如 owner/repo.git），剥掉 .git 后缀以匹配 web 形态。 */
    private static String stripGitSuffix(String repo) {
        return repo.endsWith(".git") ? repo.substring(0, repo.length() - 4) : repo;
    }
}
