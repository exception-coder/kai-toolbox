package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.repository.ScanRepository;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;

/**
 * Validates that any client-supplied {@code path} resolves to a regular file inside the scan's
 * original root directory. Symlinks are resolved via {@link Path#toRealPath} on both ends so
 * a link pointing outside the root cannot smuggle in arbitrary disk reads.
 */
@Component
public class PathAccessGuard {

    private final ScanRepository scans;

    public PathAccessGuard(ScanRepository scans) {
        this.scans = scans;
    }

    public Path resolve(String scanId, String requestedPath) throws IOException {
        ScanRecord scan = scans.findById(scanId)
                .orElseThrow(() -> new IllegalArgumentException("scan not found: " + scanId));

        Path scanRoot = Path.of(scan.getRootPath()).toRealPath();
        Path requested;
        try {
            requested = Path.of(requestedPath).toRealPath();
        } catch (NoSuchFileException e) {
            throw new NoSuchFileException(requestedPath);
        }
        if (!requested.startsWith(scanRoot)) {
            throw new IllegalArgumentException("path outside scan root");
        }
        if (!Files.isRegularFile(requested)) {
            throw new IllegalArgumentException("not a regular file");
        }
        return requested;
    }
}
