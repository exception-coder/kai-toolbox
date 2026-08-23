package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.repository.ScanRepository;
import com.exceptioncoder.toolbox.treesize.repository.VideoScanRootRepository;
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
    private final VideoScanRootRepository videoRoots;

    public PathAccessGuard(ScanRepository scans, VideoScanRootRepository videoRoots) {
        this.scans = scans;
        this.videoRoots = videoRoots;
    }

    public Path resolve(String scanId, String requestedPath) throws IOException {
        String rootPath = scans.findById(scanId).map(ScanRecord::getRootPath)
                .or(() -> videoRoots.findById(scanId).map(root -> root.path()))
                .orElseThrow(() -> new IllegalArgumentException("scan or video root not found: " + scanId));
        Path scanRoot = Path.of(rootPath).toRealPath();
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
