package com.exceptioncoder.toolbox.hosts.files;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import java.io.IOException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** Administrator file transfer endpoints backed by the registered SSH host. */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/hosts/{id}/files")
public class SftpFilesController {

    private final SftpFiles files;

    public SftpFilesController(SftpFiles files) {
        this.files = files;
    }

    @GetMapping
    public SftpFiles.Listing list(
        @PathVariable String id,
        @RequestParam(defaultValue = ".") String path
    ) {
        return files.list(id, path);
    }

    @GetMapping("/download")
    public ResponseEntity<byte[]> download(
        @PathVariable String id,
        @RequestParam String path
    ) {
        var file = files.download(id, path);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header("X-Content-SHA256", file.sha256())
            .body(file.bytes());
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SftpFiles.Uploaded upload(
        @PathVariable String id,
        @RequestParam String directory,
        @RequestParam String name,
        @RequestParam(required = false) String expectedSha256,
        @RequestPart MultipartFile file
    ) throws IOException {
        if (file.getSize() > SftpFiles.LIMIT) {
            throw new IllegalArgumentException("文件超过20 MiB");
        }
        return files.upload(
            id,
            directory,
            name,
            file.getBytes(),
            expectedSha256
        );
    }
}
