package com.exceptioncoder.toolbox.projects.service;

import com.exceptioncoder.toolbox.projects.api.dto.ProjectInfo;
import com.exceptioncoder.toolbox.projects.api.dto.ProjectType;
import com.exceptioncoder.toolbox.projects.api.dto.ProjectsListResponse;
import com.exceptioncoder.toolbox.common.project.ProjectDirectorySource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * 「项目管理」面板核心扫描逻辑。一级目录扫描 + 类型识别 + git 分支读取，对 50 个项目内毫秒级返回。
 */
@Slf4j
@Component
public class ProjectScanner {

    private final ProjectDirectorySource directories;
    private com.exceptioncoder.toolbox.common.project.ProjectCatalog catalog;

    @org.springframework.beans.factory.annotation.Autowired
    public void setProjectCatalog(com.exceptioncoder.toolbox.common.project.ProjectCatalog catalog) { this.catalog = catalog; }

    public ProjectScanner(ProjectDirectorySource directories) {
        this.directories = directories;
    }

    /**
     * 执行一次完整扫描，返回带 {@code scannedAt} 的响应包。根目录不存在时返回空 items + {@code rootExists=false}。
     */
    public ProjectsListResponse scan() {
        List<Path> roots = directories.scanRoots();
        List<ProjectInfo> unique = catalog.list(false).stream().filter(item -> item.available())
                .map(item -> toProjectInfo(Path.of(item.path()), item.name()))
                .sorted(Comparator.comparing(ProjectInfo::lastModified, Comparator.reverseOrder())).toList();
        return new ProjectsListResponse(roots.isEmpty() ? "" : roots.getFirst().toString(),
                roots.stream().anyMatch(Files::isDirectory), OffsetDateTime.now(), unique);
    }

    private ProjectInfo toProjectInfo(Path dir, String name) {
        ProjectType type = ProjectTypeDetector.detect(dir);
        String branch = readGitBranch(dir);
        OffsetDateTime mtime = readMtime(dir);
        return new ProjectInfo(
                name,
                dir.toString(),
                type,
                branch,
                mtime
        );
    }

    /**
     * 解析 {@code .git/HEAD}。已签出分支返回分支名；分离 HEAD 返回短哈希；任何 IO 错误吞掉返回 null。
     *
     * <p>静默规则见 {@code 项目管理-current.md} R4。</p>
     */
    private String readGitBranch(Path dir) {
        Path head = dir.resolve(".git").resolve("HEAD");
        if (!Files.isRegularFile(head)) {
            return null;
        }
        try {
            String content = Files.readString(head).trim();
            if (content.startsWith("ref:")) {
                int slash = content.lastIndexOf('/');
                return slash >= 0 ? content.substring(slash + 1) : content.substring(4).trim();
            }
            // detached HEAD：取前 7 位作为短哈希
            return content.length() > 7 ? content.substring(0, 7) : content;
        } catch (IOException e) {
            log.debug("读取 .git/HEAD 失败 dir={}", dir, e);
            return null;
        }
    }

    private OffsetDateTime readMtime(Path dir) {
        try {
            FileTime ft = Files.getLastModifiedTime(dir);
            return ft.toInstant().atZone(ZoneId.systemDefault()).toOffsetDateTime();
        } catch (IOException e) {
            log.debug("读取 mtime 失败 dir={}", dir, e);
            return OffsetDateTime.now();
        }
    }
}
