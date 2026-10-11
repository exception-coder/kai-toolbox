package com.exceptioncoder.toolbox.common.git;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.BiFunction;

/** 读取精确 Git 路径，并按原生忽略规则标记待提交项。 */
final class GitStatusReader {
    private final GitProperties properties;
    private final BiFunction<List<String>, byte[], String> execute;

    GitStatusReader(GitProperties properties, BiFunction<List<String>, byte[], String> execute) {
        this.properties = properties;
        this.execute = execute;
    }

    GitStatusResponse read(Path directory) {
        String binary = properties.getBinary();
        String status = execute.apply(List.of(binary, "-C", directory.toString(),
                "status", "--porcelain=v1", "-z", "-unormal"), null);
        List<GitStatusEntry> entries = parse(status);
        if (entries.isEmpty()) {
            return new GitStatusResponse(entries, List.of());
        }
        byte[] paths = (String.join("\u0000", entries.stream().map(GitStatusEntry::path).toList()) + "\u0000")
                .getBytes(StandardCharsets.UTF_8);
        String ignored = execute.apply(List.of(binary, "-C", directory.toString(),
                "check-ignore", "--no-index", "-z", "--stdin"), paths);
        return new GitStatusResponse(entries, Arrays.stream(ignored.split("\u0000"))
                .filter(path -> !path.isEmpty()).toList());
    }

    private List<GitStatusEntry> parse(String status) {
        List<GitStatusEntry> entries = new ArrayList<>();
        String[] records = status.split("\u0000", -1);
        for (int i = 0; i < records.length; i++) {
            String record = records[i];
            if (record.length() < 4) {
                continue;
            }
            String index = record.substring(0, 1);
            String worktree = record.substring(1, 2);
            String original = null;
            if ("R".equals(index) || "C".equals(index) || "R".equals(worktree) || "C".equals(worktree)) {
                original = records[++i];
            }
            entries.add(new GitStatusEntry(index, worktree, record.substring(3), original));
        }
        return entries;
    }
}
