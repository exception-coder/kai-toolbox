package com.exceptioncoder.toolbox.flatten.service;

import java.util.Set;

public final class NameConflictResolver {

    private NameConflictResolver() {}

    /**
     * Returns a name not present in {@code used}, mutating it to add the chosen name.
     * If {@code name} is free, returns it as-is. Otherwise appends {@code +1}, {@code +2}, …
     * to the stem (preserving the extension): {@code report.pdf} → {@code report+1.pdf}.
     *
     * <p>Stem/extension split: the last {@code .} in the name (and only if it isn't the leading
     * character) marks the extension. {@code archive.tar.gz} → stem {@code archive.tar}, ext {@code .gz};
     * {@code .bashrc} → stem {@code .bashrc}, ext empty.
     */
    public static String pick(Set<String> used, String name) {
        if (used.add(name)) return name;
        int dot = name.lastIndexOf('.');
        String stem = (dot > 0) ? name.substring(0, dot) : name;
        String ext = (dot > 0) ? name.substring(dot) : "";
        for (int i = 1; ; i++) {
            String candidate = stem + "+" + i + ext;
            if (used.add(candidate)) return candidate;
        }
    }
}
