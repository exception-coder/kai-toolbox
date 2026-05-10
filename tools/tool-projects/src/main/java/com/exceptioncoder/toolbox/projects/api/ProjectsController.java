package com.exceptioncoder.toolbox.projects.api;

import com.exceptioncoder.toolbox.projects.api.dto.OpenInExplorerRequest;
import com.exceptioncoder.toolbox.projects.api.dto.ProjectsListResponse;
import com.exceptioncoder.toolbox.projects.config.ProjectsProperties;
import com.exceptioncoder.toolbox.projects.service.ProjectScanner;
import com.exceptioncoder.toolbox.projects.service.ProjectsCache;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.awt.Desktop;
import java.awt.HeadlessException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * 「项目管理」面板对外接口。
 *
 * <ul>
 *   <li>{@code GET /api/projects} — 列表（带 5 秒缓存）</li>
 *   <li>{@code POST /api/projects/open} — 在系统文件管理器打开指定项目目录</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/projects")
public class ProjectsController {

    private final ProjectsProperties props;
    private final ProjectScanner scanner;
    private final ProjectsCache cache;

    public ProjectsController(ProjectsProperties props, ProjectScanner scanner, ProjectsCache cache) {
        this.props = props;
        this.scanner = scanner;
        this.cache = cache;
    }

    @GetMapping
    public ProjectsListResponse list() {
        return cache.getOrLoad(scanner::scan);
    }

    /**
     * 在系统文件管理器中打开项目目录。强制校验 path 落在 {@code toolbox.projects.root} 之内防越权。
     */
    @PostMapping("/open")
    public ResponseEntity<Void> openInExplorer(@Valid @RequestBody OpenInExplorerRequest request) {
        Path target = resolveAndValidate(request.path());
        if (!Desktop.isDesktopSupported() || !Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "服务端无桌面会话，无法打开文件管理器");
        }
        try {
            Desktop.getDesktop().open(target.toFile());
        } catch (HeadlessException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "服务端无桌面会话，无法打开文件管理器");
        } catch (IOException e) {
            log.error("打开文件管理器失败 path={}", target, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "打开文件管理器失败: " + e.getMessage());
        }
        return ResponseEntity.noContent().build();
    }

    /**
     * 把入参字符串规整为绝对路径并做三道校验：
     * <ol>
     *   <li>路径合法（{@link Path#of} 不抛）</li>
     *   <li>落在 {@code toolbox.projects.root} 之内（防 {@code ..} 越权）</li>
     *   <li>是已存在的目录</li>
     * </ol>
     */
    private Path resolveAndValidate(String rawPath) {
        String rootSetting = props.getRoot();
        if (rootSetting == null || rootSetting.isBlank()) {
            throw new IllegalArgumentException("toolbox.projects.root 未配置");
        }
        Path root = Path.of(rootSetting).toAbsolutePath().normalize();

        Path target;
        try {
            target = Path.of(rawPath).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            throw new IllegalArgumentException("path 非法: " + rawPath);
        }

        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("path 不在扫描根目录之内");
        }
        if (!Files.isDirectory(target)) {
            throw new IllegalArgumentException("path 不存在或不是目录");
        }
        return target;
    }
}
