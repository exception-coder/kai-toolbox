package com.exceptioncoder.toolbox.claudechat.domain.communication;

import java.util.List;

/** 会话内的沟通原始材料；整理备注不代表已确认规格。 */
public record CommunicationRecord(String id, String sessionId, String title, long occurredAt,
                                  String source, String participants, String sourceUrl,
                                  String originalText, String notes, List<String> attachmentIds,
                                  int version, Long deletedAt, long createdAt, long updatedAt) {
    public record Input(String title, long occurredAt, String source, String participants,
                        String sourceUrl, String originalText, String notes,
                        List<String> attachmentIds, int expectedVersion) { }

    public record Summary(String id, String title, long occurredAt, String source, String participants,
                          String excerpt, String notesExcerpt, int imageCount, int version,
                          Long deletedAt, long updatedAt) { }

    public record Page(List<Summary> records, int total, int page, int pageSize) { }
    public record Image(String id, String name, String mime, long size) { }
    public record Detail(CommunicationRecord record, List<Image> images) { }
    public record Filter(String search, String order, String notes, boolean removed, int page) { }
    public record Reference(List<CommunicationRecord> records, List<ReferenceImage> attachments) { }
    public record ReferenceImage(String id, String name, String mime, long size, String path, String recordId) { }

    public boolean sameContent(Input input) {
        return title.equals(input.title()) && occurredAt == input.occurredAt()
                && source.equals(input.source()) && participants.equals(input.participants())
                && sourceUrl.equals(input.sourceUrl()) && originalText.equals(input.originalText())
                && notes.equals(input.notes()) && attachmentIds.equals(input.attachmentIds());
    }
}
