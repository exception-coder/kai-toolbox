package com.exceptioncoder.toolbox.mail.repository;

import com.exceptioncoder.toolbox.mail.domain.MailAttachment;
import com.exceptioncoder.toolbox.mail.domain.MailInbox;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/** SQLite 持久化，操作 {@code mail_inbox} 表。 */
@Repository
public class MailInboxRepository {

    private static final Logger log = LoggerFactory.getLogger(MailInboxRepository.class);
    private static final int MAX_BODY_BYTES = 2 * 1024 * 1024;
    private static final String TRUNCATED_SUFFIX = "\n[内容已截断]";
    private static final TypeReference<List<MailAttachment>> ATTACHMENT_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public MailInboxRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /** 查询过滤条件。 */
    public record MailInboxFilter(String toAddress, Boolean read, String keyword) {}

    private final RowMapper<MailInbox> ROW = (rs, i) -> {
        List<MailAttachment> attachments = parseAttachments(rs.getString("attachments"));
        return MailInbox.builder()
                .id(rs.getString("id"))
                .messageId(rs.getString("message_id"))
                .fromAddr(rs.getString("from_addr"))
                .toAddr(rs.getString("to_addr"))
                .subject(rs.getString("subject"))
                .bodyText(rs.getString("body_text"))
                .bodyHtml(rs.getString("body_html"))
                .attachments(attachments)
                .receivedAt(rs.getLong("received_at"))
                .read(rs.getInt("is_read") == 1)
                .rawSize(rs.getObject("raw_size") != null ? rs.getLong("raw_size") : null)
                .build();
    };

    /** 保存新邮件，body 超过 2MB 时自动截断。 */
    public void save(MailInbox mail) {
        String attachmentsJson = serializeAttachments(mail.getAttachments());
        jdbc.update("""
                INSERT INTO mail_inbox
                  (id, message_id, from_addr, to_addr, subject, body_text, body_html,
                   attachments, received_at, is_read, raw_size)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                """,
                mail.getId(),
                mail.getMessageId(),
                mail.getFromAddr(),
                mail.getToAddr(),
                mail.getSubject(),
                truncate(mail.getBodyText()),
                truncate(mail.getBodyHtml()),
                attachmentsJson,
                mail.getReceivedAt(),
                mail.getRawSize());
    }

    /** 根据 id 查询邮件详情，含 body 字段。 */
    public Optional<MailInbox> findById(String id) {
        List<MailInbox> results = jdbc.query(
                "SELECT id, message_id, from_addr, to_addr, subject, body_text, body_html, " +
                "attachments, received_at, is_read, raw_size FROM mail_inbox WHERE id = ?", ROW, id);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    /** 分页查询，按 received_at 倒序。列表场景不返回 body 列。 */
    public List<MailInbox> findPage(MailInboxFilter filter, int page, int size) {
        StringBuilder sql = new StringBuilder(
                "SELECT id, message_id, from_addr, to_addr, subject, NULL AS body_text, " +
                "NULL AS body_html, attachments, received_at, is_read, raw_size " +
                "FROM mail_inbox WHERE 1=1");
        List<Object> args = new ArrayList<>();
        appendFilterClauses(sql, args, filter);
        sql.append(" ORDER BY received_at DESC LIMIT ? OFFSET ?");
        args.add(size);
        args.add((long) page * size);
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    /** 统计符合过滤条件的总数。 */
    public long countTotal(MailInboxFilter filter) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM mail_inbox WHERE 1=1");
        List<Object> args = new ArrayList<>();
        appendFilterClauses(sql, args, filter);
        Long result = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return result != null ? result : 0L;
    }

    /** 统计符合过滤条件的未读数（忽略 filter 中的 read 字段，固定 is_read=0）。 */
    public long countUnread(MailInboxFilter filter) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM mail_inbox WHERE is_read = 0");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(filter.toAddress())) {
            sql.append(" AND to_addr = ?");
            args.add(filter.toAddress());
        }
        if (StringUtils.hasText(filter.keyword())) {
            sql.append(" AND (subject LIKE ? OR from_addr LIKE ?)");
            String pattern = "%" + filter.keyword() + "%";
            args.add(pattern);
            args.add(pattern);
        }
        Long result = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return result != null ? result : 0L;
    }

    /** 标记单封为已读，返回是否真的有行被更新（不存在则 false）。 */
    public boolean markRead(String id) {
        return jdbc.update("UPDATE mail_inbox SET is_read = 1 WHERE id = ?", id) > 0;
    }

    /** 批量标记为已读，返回实际更新的行数。空集合直接返回 0，不发 SQL。 */
    public int markReadBatch(Collection<String> ids) {
        if (ids == null || ids.isEmpty()) return 0;
        String placeholders = ids.stream().map(x -> "?").collect(Collectors.joining(","));
        return jdbc.update("UPDATE mail_inbox SET is_read = 1 WHERE id IN (" + placeholders + ")",
                ids.toArray());
    }

    /** 物理删除单封，返回是否真的有行被删（不存在则 false）。 */
    public boolean deleteById(String id) {
        return jdbc.update("DELETE FROM mail_inbox WHERE id = ?", id) > 0;
    }

    /** 批量物理删除，返回实际删除的行数。空集合直接返回 0，不发 SQL。 */
    public int deleteByIdsBatch(Collection<String> ids) {
        if (ids == null || ids.isEmpty()) return 0;
        String placeholders = ids.stream().map(x -> "?").collect(Collectors.joining(","));
        return jdbc.update("DELETE FROM mail_inbox WHERE id IN (" + placeholders + ")",
                ids.toArray());
    }

    private void appendFilterClauses(StringBuilder sql, List<Object> args, MailInboxFilter filter) {
        if (StringUtils.hasText(filter.toAddress())) {
            sql.append(" AND to_addr = ?");
            args.add(filter.toAddress());
        }
        if (filter.read() != null) {
            sql.append(" AND is_read = ?");
            args.add(filter.read() ? 1 : 0);
        }
        if (StringUtils.hasText(filter.keyword())) {
            sql.append(" AND (subject LIKE ? OR from_addr LIKE ?)");
            String pattern = "%" + filter.keyword() + "%";
            args.add(pattern);
            args.add(pattern);
        }
    }

    private String truncate(String text) {
        if (text == null || text.length() <= MAX_BODY_BYTES) {
            return text;
        }
        return text.substring(0, MAX_BODY_BYTES) + TRUNCATED_SUFFIX;
    }

    private String serializeAttachments(List<MailAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(attachments);
        } catch (Exception e) {
            log.error("序列化附件元数据失败", e);
            return null;
        }
    }

    private List<MailAttachment> parseAttachments(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, ATTACHMENT_TYPE);
        } catch (Exception e) {
            log.error("解析附件元数据失败, json={}", json, e);
            return new ArrayList<>();
        }
    }
}
