package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class WorkingDirectoryBrowserTest {
    @TempDir Path temp;

    @Test
    void listsOnlyDirectoriesAndPreservesUnicodeAndOrdering() throws Exception {
        Files.createDirectory(temp.resolve("中文目录"));
        Files.createDirectory(temp.resolve("alpha"));
        Files.createDirectory(temp.resolve("Beta"));
        Files.writeString(temp.resolve("file.txt"), "not a directory");
        var result = new WorkingDirectoryBrowser(path -> true).browse(temp.toString());
        assertEquals(temp.toString(), result.path());
        assertEquals(java.util.List.of("alpha", "Beta", "中文目录"), result.directories().stream().map(WorkingDirectoryBrowser.Directory::name).toList());
        assertFalse(result.truncated());
        assertEquals(temp.getParent().toString(), result.parent());
    }

    @Test
    void excludedPathsCannotBeListedOrBrowsed() throws Exception {
        Path excluded = Files.createDirectory(temp.resolve("excluded"));
        Files.createDirectory(excluded.resolve("nested"));
        ProjectAccess policy = path -> !path.toAbsolutePath().normalize().startsWith(excluded);
        var browser = new WorkingDirectoryBrowser(policy);
        assertTrue(browser.browse(temp.toString()).directories().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> browser.browse(excluded.resolve("nested").toString()));
        assertThrows(IllegalArgumentException.class, () -> browser.browse(excluded.resolve("../excluded").toString()));
    }

    @Test
    void deniesLinksToExcludedRealDirectories() throws Exception {
        Path excluded = Files.createDirectory(temp.resolve("excluded"));
        Path alias = temp.resolve("alias");
        Path excludedReal = excluded.toRealPath();
        var browser = new WorkingDirectoryBrowser(path -> !path.equals(excludedReal));
        assertThrows(IllegalArgumentException.class, () -> browser.browse(excluded.toString()));
        try { Files.createSymbolicLink(alias, excluded); }
        catch (java.io.IOException | UnsupportedOperationException | SecurityException ex) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "当前用户不能创建符号链接: " + ex.getClass().getSimpleName());
            return;
        }
        assertTrue(browser.browse(temp.toString()).directories().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> browser.browse(alias.toString()));
    }

    @Test
    void invalidLocationsAreNotReportedAsEmptyDirectories() throws Exception {
        var browser = new WorkingDirectoryBrowser(path -> true);
        assertThrows(IllegalArgumentException.class, () -> browser.browse("relative-folder"));
        assertThrows(IllegalArgumentException.class, () -> browser.browse(temp.resolve("missing").toString()));
        Path file = Files.writeString(temp.resolve("file"), "text");
        assertThrows(IllegalArgumentException.class, () -> browser.browse(file.toString()));
        assertTrue(browser.roots().contains(temp.getRoot().toString()));
    }

    @Test
    void directoryListingIsBoundedAndMarksTruncation() throws Exception {
        for (int i = 0; i < 501; i++) Files.createDirectory(temp.resolve("dir-" + i));
        var result = new WorkingDirectoryBrowser(path -> true).browse(temp.toString());
        assertEquals(500, result.directories().size());
        assertTrue(result.truncated());
    }
}
