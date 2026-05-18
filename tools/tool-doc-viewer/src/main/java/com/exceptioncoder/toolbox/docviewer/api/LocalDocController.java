package com.exceptioncoder.toolbox.docviewer.api;

import com.exceptioncoder.toolbox.docviewer.api.dto.CreateLocalSourceRequest;
import com.exceptioncoder.toolbox.docviewer.api.dto.LocalFileDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.LocalSourceDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.LocalTreeResponseDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.SaveLocalFileRequest;
import com.exceptioncoder.toolbox.docviewer.api.dto.SaveLocalFileResponse;
import com.exceptioncoder.toolbox.docviewer.service.LocalDocService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/doc-viewer/local")
public class LocalDocController {

    private final LocalDocService service;

    public LocalDocController(LocalDocService service) {
        this.service = service;
    }

    @PostMapping("/sources")
    public LocalSourceDTO create(@RequestBody CreateLocalSourceRequest req) {
        return service.createOrGetSource(req.getRootPath(), req.getAlias());
    }

    @GetMapping("/sources")
    public List<LocalSourceDTO> list() {
        return service.listSources();
    }

    @DeleteMapping("/sources/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.deleteSource(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sources/{id}/tree")
    public LocalTreeResponseDTO tree(@PathVariable String id) {
        return service.getTree(id);
    }

    @GetMapping("/sources/{id}/file")
    public LocalFileDTO file(@PathVariable String id, @RequestParam String path) {
        return service.getFile(id, path);
    }

    @PutMapping("/sources/{id}/file")
    public SaveLocalFileResponse save(@PathVariable String id, @RequestBody SaveLocalFileRequest req) {
        return service.saveFile(id, req.getPath(), req.getContent(), req.getExpectedLastModified());
    }

    // 给 markdown 中的 <img src="./xxx.png"> 这类相对资源走的字节直读
    @GetMapping("/sources/{id}/raw")
    public ResponseEntity<byte[]> raw(@PathVariable String id, @RequestParam String path) {
        LocalDocService.RawBytes b = service.readRawBytes(id, path);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, b.contentType())
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .body(b.data());
    }
}
