package com.exceptioncoder.toolbox.docviewer.service;

import com.exceptioncoder.toolbox.docviewer.api.dto.CreateReviewNoteRequest;
import com.exceptioncoder.toolbox.docviewer.api.dto.ReviewNoteDTO;
import com.exceptioncoder.toolbox.docviewer.api.dto.UpdateReviewNoteRequest;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerErrorCode;
import com.exceptioncoder.toolbox.docviewer.exception.DocViewerException;
import com.exceptioncoder.toolbox.docviewer.repository.DocReviewNoteRepository;
import com.exceptioncoder.toolbox.docviewer.repository.LocalDocRepository;
import com.exceptioncoder.toolbox.docviewer.repository.entity.DocReviewNote;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.List;
import java.util.Set;

@Service
public class DocReviewNoteService {

    private static final int MAX_CONTENT_LENGTH = 4000;
    private static final int MAX_HEADING_LENGTH = 300;
    private static final int MAX_PATH_LENGTH = 2000;
    private static final Set<String> CATEGORIES = Set.of("CLARIFICATION", "DISPUTE", "FOLLOW_UP");
    private static final Set<String> STATUSES = Set.of("OPEN", "RESOLVED");

    private final LocalDocRepository localDocRepository;
    private final DocReviewNoteRepository noteRepository;
    private final SecureRandom random = new SecureRandom();

    public DocReviewNoteService(LocalDocRepository localDocRepository,
                                DocReviewNoteRepository noteRepository) {
        this.localDocRepository = localDocRepository;
        this.noteRepository = noteRepository;
    }

    public List<ReviewNoteDTO> list(String sourceId, String filePath) {
        requireSource(sourceId);
        String normalizedPath = requireText(filePath, "path", MAX_PATH_LENGTH);
        return noteRepository.listByFile(sourceId, normalizedPath).stream()
                .map(ReviewNoteDTO::from)
                .toList();
    }

    public ReviewNoteDTO create(String sourceId, CreateReviewNoteRequest request) {
        requireSource(sourceId);
        if (request == null) {
            throw invalid("请求内容不能为空");
        }
        String category = requireEnum(request.getCategory(), "category", CATEGORIES);
        Integer headingLevel = request.getHeadingLevel();
        if (headingLevel == null || (headingLevel != 2 && headingLevel != 3)) {
            throw invalid("headingLevel 只支持 2 或 3");
        }
        long now = System.currentTimeMillis();
        DocReviewNote note = DocReviewNote.builder()
                .id("note_" + randomShortId())
                .sourceId(sourceId)
                .filePath(requireMarkdownPath(request.getFilePath()))
                .headingId(requireText(request.getHeadingId(), "headingId", MAX_HEADING_LENGTH))
                .headingText(requireText(request.getHeadingText(), "headingText", MAX_HEADING_LENGTH))
                .headingLevel(headingLevel)
                .category(category)
                .content(requireText(request.getContent(), "content", MAX_CONTENT_LENGTH))
                .status("OPEN")
                .createdAt(now)
                .updatedAt(now)
                .build();
        noteRepository.insert(note);
        return ReviewNoteDTO.from(note);
    }

    public ReviewNoteDTO update(String sourceId, String noteId, UpdateReviewNoteRequest request) {
        requireSource(sourceId);
        if (request == null) {
            throw invalid("请求内容不能为空");
        }
        DocReviewNote note = requireNote(sourceId, noteId);
        note.setCategory(requireEnum(request.getCategory(), "category", CATEGORIES));
        note.setContent(requireText(request.getContent(), "content", MAX_CONTENT_LENGTH));
        note.setStatus(requireEnum(request.getStatus(), "status", STATUSES));
        note.setUpdatedAt(System.currentTimeMillis());
        if (noteRepository.update(note) == 0) {
            throw notFound(noteId);
        }
        return ReviewNoteDTO.from(note);
    }

    public void delete(String sourceId, String noteId) {
        requireSource(sourceId);
        if (noteRepository.delete(noteId, sourceId) == 0) {
            throw notFound(noteId);
        }
    }

    private DocReviewNote requireNote(String sourceId, String noteId) {
        return noteRepository.findByIdAndSourceId(noteId, sourceId)
                .orElseThrow(() -> notFound(noteId));
    }

    private void requireSource(String sourceId) {
        if (localDocRepository.findById(sourceId).isEmpty()) {
            throw new DocViewerException(DocViewerErrorCode.SOURCE_NOT_FOUND,
                    "本地目录源不存在: " + sourceId);
        }
    }

    private String requireText(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) {
            throw invalid(field + " 不能为空");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw invalid(field + " 长度不能超过 " + maxLength);
        }
        return normalized;
    }

    private String requireEnum(String value, String field, Set<String> allowed) {
        String normalized = requireText(value, field, 40).toUpperCase();
        if (!allowed.contains(normalized)) {
            throw invalid(field + " 不支持: " + value);
        }
        return normalized;
    }

    private String requireMarkdownPath(String value) {
        String path = requireText(value, "filePath", MAX_PATH_LENGTH);
        String lower = path.toLowerCase();
        if (!lower.endsWith(".md") && !lower.endsWith(".markdown") && !lower.endsWith(".mdx")) {
            throw invalid("审阅备注只支持 Markdown 文件");
        }
        return path;
    }

    private DocViewerException invalid(String message) {
        return new DocViewerException(DocViewerErrorCode.INVALID_REVIEW_NOTE, message);
    }

    private DocViewerException notFound(String noteId) {
        return new DocViewerException(DocViewerErrorCode.REVIEW_NOTE_NOT_FOUND,
                "审阅备注不存在: " + noteId);
    }

    private String randomShortId() {
        byte[] bytes = new byte[8];
        random.nextBytes(bytes);
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) {
            result.append(String.format("%02x", value));
        }
        return result.toString();
    }
}
