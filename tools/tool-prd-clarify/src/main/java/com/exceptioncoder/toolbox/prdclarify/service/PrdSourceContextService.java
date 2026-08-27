package com.exceptioncoder.toolbox.prdclarify.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** 从受控项目目录提取有限的源码路径证据。 */
@Service
public class PrdSourceContextService {

    private static final Pattern TERM = Pattern.compile("[\\p{L}\\p{N}_$-]{3,}");
    private static final int MAX_FILES = 40;

    /** 返回与模块或需求词匹配的源码文件路径。 */
    public String query(String projectPath, String module, String question) {
        Path root = Path.of(projectPath).toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            return null;
        }
        List<String> terms = terms(module + "\n" + question);
        if (terms.isEmpty()) {
            return "源码目录可访问：" + root;
        }
        try (Stream<Path> paths = Files.walk(root, 8)) {
            List<String> hits = paths.filter(Files::isRegularFile)
                    .filter(path -> !path.toString().contains("graphify-out"))
                    .filter(path -> matches(root.relativize(path).toString(), terms))
                    .limit(MAX_FILES)
                    .map(path -> root.relativize(path).toString())
                    .toList();
            return hits.isEmpty() ? "" : "源码目录：" + root + "\n" + String.join("\n", hits);
        } catch (IOException error) {
            throw new IllegalStateException("读取源码目录失败: " + root, error);
        }
    }

    private static List<String> terms(String value) {
        java.util.ArrayList<String> terms = new java.util.ArrayList<>();
        Matcher matcher = TERM.matcher(value == null ? "" : value.toLowerCase(Locale.ROOT));
        while (matcher.find() && terms.size() < 20) {
            terms.add(matcher.group());
        }
        return terms.stream().distinct().toList();
    }

    private static boolean matches(String path, List<String> terms) {
        String normalized = path.toLowerCase(Locale.ROOT);
        return terms.stream().anyMatch(normalized::contains);
    }
}
