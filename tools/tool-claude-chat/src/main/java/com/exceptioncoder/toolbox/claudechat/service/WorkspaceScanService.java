package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse.RootView;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * 扫描配置根目录的一级子目录，供新建会话选 cwd。对标项目管理面板的「一级扫描 + 短 TTL 缓存」。
 *
 * <p>缓存为整次扫描结果的单一快照：TTL 内任何请求直接返回，过期重扫。无锁——并发下最坏多扫一两次，
 * 结果一致，可接受。</p>
 */
@Slf4j
@Service
public class WorkspaceScanService {

    private final WorkspaceProperties props;

    private volatile WorkspaceListResponse cache;
    private volatile long cacheExpireAt;

    public WorkspaceScanService(WorkspaceProperties props) {
        this.props = props;
    }

    public WorkspaceListResponse scan() {
        long now = System.currentTimeMillis();
        WorkspaceListResponse cached = cache;
        if (cached != null && now < cacheExpireAt) {
            return cached;
        }

        List<RootView> roots = new ArrayList<>();
        for (String rootSetting : props.getRoots()) {
            roots.add(scanRoot(rootSetting));
        }
        WorkspaceListResponse result = new WorkspaceListResponse(List.copyOf(roots), OffsetDateTime.now());

        cache = result;
        int ttl = props.getCacheTtlSeconds() <= 0 ? 5 : props.getCacheTtlSeconds();
        cacheExpireAt = now + ttl * 1000L;
        return result;
    }

    private RootView scanRoot(String rootSetting) {
        if (rootSetting == null || rootSetting.isBlank()) {
            return new RootView("", false, List.of());
        }
        Path root = Path.of(rootSetting).toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            log.debug("workspace 根目录不存在或不可读: {}", root);
            return new RootView(rootSetting, false, List.of());
        }

        List<WorkspaceDirView> dirs = new ArrayList<>();
        try (Stream<Path> children = Files.list(root)) {
            children.filter(this::isCandidate)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .forEach(p -> dirs.add(new WorkspaceDirView(p.getFileName().toString(), p.toString())));
        } catch (IOException e) {
            log.debug("扫描 workspace 根目录失败: {}", root, e);
            return new RootView(rootSetting, true, List.of());
        }
        return new RootView(rootSetting, true, List.copyOf(dirs));
    }

    private boolean isCandidate(Path dir) {
        if (!Files.isDirectory(dir)) {
            return false;
        }
        String name = dir.getFileName().toString();
        for (String prefix : props.getHiddenPrefixes()) {
            if (name.startsWith(prefix)) {
                return false;
            }
        }
        return true;
    }
}
