package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SubdirListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.TaskspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TaskspaceView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TaskspaceView.MemberView;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryNotEmptyException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * 合并工作区(taskspace)：在某父目录下新建一个目录，内部用软链接聚合若干源项目，
 * 把建好的目录直接当 Vibe Coding 会话的 cwd。逻辑蓝本是用户已跑通的 taskspace.mjs，
 * 清单文件 .taskspace.json 同名同结构，两者互通。
 *
 * 跨平台建链接：Windows 走 cmd /c mklink /J（junction，免管理员），其它平台走 Files.createSymbolicLink。
 * 三条安全红线：1) 删前判定必须是链接才动手；2) Files.delete 只删链接本身，碰真实非空目录抛异常兜底；
 * 3) 声明式清单 .taskspace.json：teardown 无清单则拒绝；目录非空只拆链接、保留目录。
 */
@Slf4j
@Service
public class TaskspaceService {

    private static final String MANIFEST = ".taskspace.json";
    private static final boolean IS_WINDOWS =
            System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");

    private final WorkspaceProperties props;
    private final ObjectMapper objectMapper;

    public TaskspaceService(WorkspaceProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TaskspaceManifest(String name, String base, String createdOn, List<Member> members) {
    }

    public record Member(String link, String target) {
    }

    /** 列父目录的一级子目录（目录 + 目录型链接），供多选。父目录不存在时返回 exists=false 而非报错。 */
    public SubdirListResponse listSubdirs(String parent) {
        if (parent == null || parent.isBlank()) {
            throw new IllegalArgumentException("父目录不能为空");
        }
        Path root = Path.of(parent).toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            return new SubdirListResponse(root.toString(), false, List.of());
        }
        List<TaskspaceDirView> dirs = new ArrayList<>();
        try (Stream<Path> children = Files.list(root)) {
            children.filter(this::isCandidate)
                    .sorted(Comparator.comparing(x -> x.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .forEach(x -> dirs.add(new TaskspaceDirView(
                            x.getFileName().toString(), x.toString(), isLink(x))));
        } catch (IOException e) {
            log.debug("列举子目录失败: {}", root, e);
            return new SubdirListResponse(root.toString(), true, List.of());
        }
        return new SubdirListResponse(root.toString(), true, List.copyOf(dirs));
    }

    private boolean isCandidate(Path p) {
        if (!Files.isDirectory(p)) {
            return false;
        }
        String name = p.getFileName().toString();
        for (String prefix : props.getHiddenPrefixes()) {
            if (name.startsWith(prefix)) {
                return false;
            }
        }
        return true;
    }

    /** 在 base 下新建 name 目录并为每个 member 建链接，写清单，返回工作区视图。 */
    public TaskspaceView create(String base, String name, List<String> members) {
        if (base == null || base.isBlank()) {
            throw new IllegalArgumentException("父目录(base)不能为空");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("工作区名称不能为空");
        }
        if (members == null || members.isEmpty()) {
            throw new IllegalArgumentException("至少选择一个目录");
        }
        Path baseDir = Path.of(base).toAbsolutePath().normalize();
        if (!Files.isDirectory(baseDir)) {
            throw new IllegalArgumentException("父目录不存在: " + baseDir);
        }
        Path wsDir = baseDir.resolve(name.trim()).normalize();
        if (!wsDir.getParent().equals(baseDir)) {
            throw new IllegalArgumentException("工作区名称非法（不能含路径分隔符）: " + name);
        }
        if (Files.exists(wsDir)) {
            throw new IllegalArgumentException("工作区已存在（如需追加用 add）: " + wsDir);
        }
        try {
            Files.createDirectories(wsDir);
        } catch (IOException e) {
            throw new IllegalArgumentException("创建工作区目录失败: " + e.getMessage());
        }
        List<Member> added = linkMembers(wsDir, members);
        TaskspaceManifest manifest = new TaskspaceManifest(name.trim(), baseDir.toString(), "taskspace", added);
        writeManifest(wsDir, manifest);
        return toView(wsDir, manifest);
    }

    /** 读工作区清单并计算每个链接的存活状态。 */
    public TaskspaceView read(String dir) {
        Path wsDir = requireWorkspace(dir);
        TaskspaceManifest manifest = readManifest(wsDir);
        if (manifest == null) {
            throw new IllegalArgumentException("不是 taskspace 工作区（缺 " + MANIFEST + "）: " + wsDir);
        }
        return toView(wsDir, manifest);
    }

    public TaskspaceView add(String dir, List<String> members) {
        if (members == null || members.isEmpty()) {
            throw new IllegalArgumentException("至少选择一个目录");
        }
        Path wsDir = requireWorkspace(dir);
        TaskspaceManifest manifest = readManifest(wsDir);
        if (manifest == null) {
            throw new IllegalArgumentException("不是 taskspace 工作区（缺 " + MANIFEST + "）: " + wsDir);
        }
        List<Member> all = new ArrayList<>(manifest.members());
        all.addAll(linkMembers(wsDir, members));
        TaskspaceManifest updated = new TaskspaceManifest(manifest.name(), manifest.base(), manifest.createdOn(), all);
        writeManifest(wsDir, updated);
        return toView(wsDir, updated);
    }

    public TaskspaceView removeLinks(String dir, List<String> links) {
        if (links == null || links.isEmpty()) {
            throw new IllegalArgumentException("未指定要移除的链接");
        }
        Path wsDir = requireWorkspace(dir);
        TaskspaceManifest manifest = readManifest(wsDir);
        if (manifest == null) {
            throw new IllegalArgumentException("不是 taskspace 工作区（缺 " + MANIFEST + "）: " + wsDir);
        }
        List<Member> remaining = new ArrayList<>(manifest.members());
        for (String link : links) {
            boolean ok = removeLink(wsDir.resolve(link));
            if (ok) {
                remaining.removeIf(m -> m.link().equals(link));
            } else {
                log.warn("移除链接被跳过（非链接，已保护）: {}", wsDir.resolve(link));
            }
        }
        TaskspaceManifest updated = new TaskspaceManifest(manifest.name(), manifest.base(), manifest.createdOn(), remaining);
        writeManifest(wsDir, updated);
        return toView(wsDir, updated);
    }

    /** 拆除工作区：逐个删链接 + 删清单；目录已空才删目录本身，源目录绝不触碰。 */
    public void teardown(String dir) {
        Path wsDir = requireWorkspace(dir);
        TaskspaceManifest manifest = readManifest(wsDir);
        if (manifest == null) {
            throw new IllegalArgumentException(
                    "不是 taskspace 工作区（缺 " + MANIFEST + "），为安全起见拒绝拆除: " + wsDir);
        }
        for (Member m : manifest.members()) {
            removeLink(wsDir.resolve(m.link()));
        }
        try {
            Files.deleteIfExists(wsDir.resolve(MANIFEST));
        } catch (IOException e) {
            log.warn("删除清单失败: {}", wsDir, e);
        }
        try (Stream<Path> rest = Files.list(wsDir)) {
            if (rest.findAny().isEmpty()) {
                Files.delete(wsDir);
                log.info("工作区目录已清空并删除: {}", wsDir);
            } else {
                log.info("链接已拆除，目录非空（还有非链接文件），保留: {}", wsDir);
            }
        } catch (IOException e) {
            log.warn("清理工作区目录失败: {}", wsDir, e);
        }
    }
