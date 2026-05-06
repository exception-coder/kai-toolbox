package com.exceptioncoder.toolbox.treesize.service;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * Zero-copy direct streaming for browser-natively-supported video formats. Spring's
 * {@code ResourceRegionHttpMessageConverter} writes the byte range and sets {@code Content-Range}
 * automatically, so this only needs to compute the slice + pick a sensible content type.
 *
 * <p>The Range response covers the full requested range — no server-side cap. TCP backpressure
 * is the right flow-control: the browser only reads as fast as it plays plus its buffer-ahead,
 * which stalls our writer, which stalls the disk read. Capping ourselves only forces the
 * browser into many small follow-up requests with their own connection / dispatch overhead.
 */
@Component
public class RawStreamService {

    public ResponseEntity<ResourceRegion> serve(Path file, HttpHeaders requestHeaders) throws IOException {
        long contentLength = Files.size(file);
        Resource resource = new FileSystemResource(file);
        MediaType mime = mimeFromExtension(file.getFileName().toString());

        List<HttpRange> ranges = requestHeaders.getRange();
        if (ranges.isEmpty()) {
            ResourceRegion full = new ResourceRegion(resource, 0, contentLength);
            return ResponseEntity.status(HttpStatus.OK)
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .contentType(mime)
                    .body(full);
        }
        HttpRange first = ranges.get(0);
        ResourceRegion region = first.toResourceRegion(resource);
        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentType(mime)
                .body(region);
    }

    private static MediaType mimeFromExtension(String name) {
        int dot = name.lastIndexOf('.');
        String ext = (dot > 0 ? name.substring(dot + 1) : "").toLowerCase(Locale.ROOT);
        return switch (ext) {
            case "mp4", "m4v", "mov" -> MediaType.parseMediaType("video/mp4");
            case "webm" -> MediaType.parseMediaType("video/webm");
            case "ogv", "ogg" -> MediaType.parseMediaType("video/ogg");
            default -> MediaType.APPLICATION_OCTET_STREAM;
        };
    }
}
