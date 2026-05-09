package com.exceptioncoder.toolbox.docviewer.api;

import com.exceptioncoder.toolbox.docviewer.api.dto.CreateSourceRequest;
import com.exceptioncoder.toolbox.docviewer.api.dto.FileDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.RefreshOutcomeDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.SourceDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.TreeResponseDTO;
import com.exceptioncoder.toolbox.docviewer.service.DocViewerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/doc-viewer")
public class DocViewerController {

    private final DocViewerService service;

    public DocViewerController(DocViewerService service) {
        this.service = service;
    }

    @PostMapping("/sources")
    public SourceDTO createSource(@RequestBody CreateSourceRequest req) {
        return service.createOrGetSource(req.getUrl(), req.getPat(), req.getAlias());
    }

    @GetMapping("/sources")
    public List<SourceDTO> listSources() {
        return service.listSources();
    }

    @DeleteMapping("/sources/{id}")
    public ResponseEntity<Void> deleteSource(@PathVariable String id) {
        service.deleteSource(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sources/{id}/refresh")
    public RefreshOutcomeDTO refreshSource(@PathVariable String id) {
        return service.refreshTree(id);
    }

    @GetMapping("/sources/{id}/tree")
    public TreeResponseDTO getTree(@PathVariable String id) {
        return service.getTree(id);
    }

    @GetMapping("/sources/{id}/file")
    public FileDTO getFile(@PathVariable String id, @RequestParam String path) {
        return service.getFile(id, path);
    }
}
