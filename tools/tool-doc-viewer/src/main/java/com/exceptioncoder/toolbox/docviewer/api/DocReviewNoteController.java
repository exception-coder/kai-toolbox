package com.exceptioncoder.toolbox.docviewer.api;

import com.exceptioncoder.toolbox.docviewer.api.dto.CreateReviewNoteRequest;
import com.exceptioncoder.toolbox.docviewer.api.dto.ReviewNoteDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.UpdateReviewNoteRequest;
import com.exceptioncoder.toolbox.docviewer.service.DocReviewNoteService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/doc-viewer/local/sources/{sourceId}/review-notes")
public class DocReviewNoteController {

    private final DocReviewNoteService service;

    public DocReviewNoteController(DocReviewNoteService service) {
        this.service = service;
    }

    @GetMapping
    public List<ReviewNoteDTO> list(@PathVariable String sourceId, @RequestParam String path) {
        return service.list(sourceId, path);
    }

    @PostMapping
    public ResponseEntity<ReviewNoteDTO> create(@PathVariable String sourceId,
                                                @RequestBody CreateReviewNoteRequest request) {
        ReviewNoteDTO created = service.create(sourceId, request);
        return ResponseEntity.created(URI.create("/api/doc-viewer/local/sources/" + sourceId
                + "/review-notes/" + created.getId())).body(created);
    }

    @PutMapping("/{noteId}")
    public ReviewNoteDTO update(@PathVariable String sourceId,
                                @PathVariable String noteId,
                                @RequestBody UpdateReviewNoteRequest request) {
        return service.update(sourceId, noteId, request);
    }

    @DeleteMapping("/{noteId}")
    public ResponseEntity<Void> delete(@PathVariable String sourceId, @PathVariable String noteId) {
        service.delete(sourceId, noteId);
        return ResponseEntity.noContent().build();
    }
}
