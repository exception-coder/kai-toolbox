package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Read-only directory navigation; it does not register projects or change workspace scan roots. */
@Service
public class WorkingDirectoryBrowser {
    private static final int MAX_CHILDREN = 500;
    private final ProjectAccess access;

    public WorkingDirectoryBrowser(ProjectAccess access) {
        this.access = access;
    }

    public record Directory(String name, String path) { }
    public record Listing(String path, String parent, List<Directory> directories, boolean truncated) { }

    public List<String> roots() {
        List<String> roots = new ArrayList<>();
        for (Path root : FileSystems.getDefault().getRootDirectories()) {
            if (access.allowed(root)) roots.add(root.toString());
        }
        return List.copyOf(roots);
    }

    public Listing browse(String value) {
        Path path = Path.of(value == null || value.isBlank() ? System.getProperty("user.home") : value);
        if (!path.isAbsolute()) throw new IllegalArgumentException("请选择绝对目录路径");
        path = path.normalize();
        access.requireAllowed(path);
        if (!Files.isDirectory(path)) throw new IllegalArgumentException("目录不存在或不可访问，请选择其他目录");
        try {
            access.requireAllowed(path.toRealPath());
            List<Directory> children;
            try (var stream = Files.list(path)) {
                children = stream.filter(this::selectable)
                        .limit(MAX_CHILDREN + 1L)
                        .map(child -> new Directory(child.getFileName().toString(), child.toString()))
                        .sorted(Comparator.comparing(Directory::name, String.CASE_INSENSITIVE_ORDER))
                        .toList();
            }
            Path parent = path.getParent();
            String allowedParent = parent != null && selectable(parent) ? parent.toString() : null;
            return new Listing(path.toString(), allowedParent,
                    children.subList(0, Math.min(children.size(), MAX_CHILDREN)), children.size() > MAX_CHILDREN);
        } catch (IOException | SecurityException ex) {
            throw new IllegalArgumentException("无法读取此目录，请检查磁盘与访问权限或选择其他目录", ex);
        }
    }

    private boolean selectable(Path path) {
        if (!access.allowed(path) || !Files.isDirectory(path)) return false;
        try {
            return access.allowed(path.toRealPath());
        } catch (IOException | SecurityException ex) {
            return false;
        }
    }
}
