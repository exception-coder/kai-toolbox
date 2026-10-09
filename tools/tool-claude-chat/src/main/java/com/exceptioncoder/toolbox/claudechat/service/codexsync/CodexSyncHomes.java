package com.exceptioncoder.toolbox.claudechat.service.codexsync;

import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

/** Resolves only direct Codex homes of the runtime user; also rejects junction escapes. */
@Component
public class CodexSyncHomes {
    public String resolve(String requested) {
        return resolve(Path.of(System.getProperty("user.home")), requested);
    }

    String resolve(Path userHome, String requested) {
        try {
            Path user = userHome.toAbsolutePath().normalize();
            Path path = requested == null || requested.isBlank()
                    ? user.resolve(".codex") : Path.of(requested).toAbsolutePath().normalize();
            if (!user.equals(path.getParent()) || !path.getFileName().toString().startsWith(".codex")
                    || !Files.isDirectory(path) || Files.isSymbolicLink(path)
                    || !user.toRealPath().equals(path.toRealPath().getParent())) {
                throw new ResponseStatusException(BAD_REQUEST, "请选择当前运行用户目录内真实的 .codex 授权目录");
            }
            return path.toRealPath().toString();
        } catch (IOException | InvalidPathException error) {
            throw new ResponseStatusException(BAD_REQUEST, "Codex 授权目录不存在或不可读取");
        }
    }
}
