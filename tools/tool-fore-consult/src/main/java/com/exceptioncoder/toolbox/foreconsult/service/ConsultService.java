package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ArchiveRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultFeedback;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultFeedbackRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnExtractionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * 业务系统咨询归档服务：只负责会话生命周期的建/关联/归档/查询/删除，不含回答引擎
 * （回答由复用的 claude-chat 悬浮会话完成）。归档过程容错——写库/解析异常时把会话降级为
 * FAILED 并记录原因，不把异常抛回前端，避免用户结束咨询时因归档失败而丢失可用对话。
 */
@Service
public class ConsultService {

    private static final Logger log = LoggerFactory.getLogger(ConsultService.class);

    private final ConsultSessionRepository sessionRepo;
    private final ConsultTurnRepository turnRepo;
    private final ConsultFeedbackRepository feedbackRepo;
    private final ConsultTurnExtractionRepository extractionRepo;
    private final ObjectMapper mapper = new ObjectMapper();

    public ConsultService(ConsultSessionRepository sessionRepo, ConsultTurnRepository turnRepo,
                          ConsultFeedbackRepository feedbackRepo,
                          ConsultTurnExtractionRepository extractionRepo) {
        this.sessionRepo = sessionRepo;
        this.turnRepo = turnRepo;
        this.feedbackRepo = feedbackRepo;
        this.extractionRepo = extractionRepo;
    }

    /** 保存/更新某轮回答的评分反馈（按 sessionId+turnIndex upsert）。 */
    public ConsultFeedback saveFeedback(String sessionId, int turnIndex, com.exceptioncoder.toolbox.foreconsult.api.dto.FeedbackRequest req) {
        requireAccessibleSession(sessionId);
        long now = System.currentTimeMillis();
        ConsultFeedback f = ConsultFeedback.builder()
                .sessionId(sessionId)
                .turnIndex(turnIndex)
                .rating(req.rating() != null && req.rating().equalsIgnoreCase("GOOD") ? "GOOD" : "BAD")
                .category(blankToNull(req.category()))
                .reason(blankToNull(req.reason()))
                .correctAnswer(blankToNull(req.correctAnswer()))
                .createdAt(now)
                .updatedAt(now)
                .build();
        feedbackRepo.upsert(f);
        return f;
    }

    public List<ConsultFeedback> feedbackOf(String sessionId) {
        requireAccessibleSession(sessionId);
        return feedbackRepo.findBySession(sessionId);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** 启动咨询会话：落一条 PENDING 记录。 */
    public ConsultSession startSession(StartSessionRequest req) {
        String currentUserId = AuthContext.current()
                .map(AuthPrincipal::userId)
                .map(String::valueOf)
                .orElseGet(() -> blankToNull(req.userId()));
        ConsultSession s = ConsultSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .userId(currentUserId)
                .systemName(req.systemName())
                .systemSourcePath(req.systemSourcePath())
                .moduleNames(serializeModules(req.moduleNames()))
                .promptSnapshot(req.promptSnapshot())
                .role(req.role() != null && !req.role().isBlank() ? req.role() : "IT")
                .parseStatus("NONE")
                .archiveStatus("PENDING")
                .createdAt(System.currentTimeMillis())
                .build();
        sessionRepo.insert(s);
        return s;
    }

    /** 回写关联的 claude-chat 会话 id。 */
    public ConsultSession linkDevSession(String sessionId, String devSessionId) {
        ConsultSession s = requireAccessibleSession(sessionId);
        sessionRepo.updateDevSessionId(sessionId, devSessionId);
        s.setDevSessionId(devSessionId);
        return s;
    }

    /**
     * 结束咨询并归档（一次性提交本次会话全部轮次）。容错：轮次写库或状态更新失败时，
     * 会话降级为 FAILED 并记录原因，方法本身不抛异常（会话不存在除外）。
     */
    public ConsultSession archive(String sessionId, ArchiveRequest req) {
        ConsultSession s = requireAccessibleSession(sessionId);
        long now = System.currentTimeMillis();
        try {
            writeTurns(sessionId, req.turns(), now);
            String parseStatus = req.parseStatus() != null && !req.parseStatus().isBlank()
                    ? req.parseStatus() : "NONE";
            sessionRepo.markArchived(sessionId, req.rawReferenceJson(), parseStatus, now);
            return requireAccessibleSession(sessionId);
        } catch (Exception e) {
            log.warn("[fore-consult] 会话 {} 归档失败，降级为 FAILED: {}", sessionId, e.getMessage(), e);
            try {
                sessionRepo.markFailed(sessionId, truncate(e.getMessage()), now);
            } catch (Exception ignore) {
                // 连状态更新都失败时不再抛出，保持接口对前端幂等可重试。
            }
            return sessionRepo.findById(sessionId).orElse(s);
        }
    }

    /**
     * 进行中增量落库：把当前对话轮次写进库但**保持 PENDING**（不结束、不置 SUCCESS/ended_at），
     * 让同一用户在其它电脑（以及管理员）也能从库里查看进行中的对话内容。容错，失败忽略。
     */
    public ConsultSession syncTurns(String sessionId, ArchiveRequest req) {
        ConsultSession s = requireAccessibleSession(sessionId);
        try {
            writeTurns(sessionId, req.turns(), System.currentTimeMillis());
            sessionRepo.updateSyncedRaw(sessionId, req.rawReferenceJson());
        } catch (Exception e) {
            log.warn("[fore-consult] 会话 {} 增量同步失败（忽略）: {}", sessionId, e.getMessage());
        }
        return sessionRepo.findById(sessionId).orElse(s);
    }

    /** 整表替换写入本次会话的轮次（归档与增量同步共用）。 */
    private void writeTurns(String sessionId, List<ArchiveRequest.TurnItem> turns, long now) {
        turnRepo.deleteBySession(sessionId);
        List<ArchiveRequest.TurnItem> items = turns != null ? turns : List.of();
        items.stream()
                .map(ArchiveRequest.TurnItem::question)
                .filter(question -> question != null && !question.isBlank())
                .findFirst()
                .map(ConsultService::deriveQuestionTitle)
                .ifPresent(title -> sessionRepo.updateQuestionTitleIfEmpty(sessionId, title));
        int seq = 1;
        for (ArchiveRequest.TurnItem item : items) {
            int index = item.turnIndex() > 0 ? item.turnIndex() : seq;
            turnRepo.insert(ConsultTurn.builder()
                    .turnId(UUID.randomUUID().toString())
                    .sessionId(sessionId)
                    .turnIndex(index)
                    .question(item.question())
                    .answer(item.answer())
                    .refMenuPaths(item.refMenuPaths())
                    .refGraphifyNodes(item.refGraphifyNodes())
                    .refDomainKnowledge(item.refDomainKnowledge())
                    .attachments(serializeAttachments(item.attachments()))
                    .createdAt(now)
                    .build());
            seq++;
        }
    }

    private static String deriveQuestionTitle(String question) {
        String normalized = question.replaceAll("\\s+", " ").trim();
        return normalized.length() <= 40 ? normalized : normalized.substring(0, 39) + "…";
    }

    public List<ConsultSession> listRecent(int limit) {
        return AuthContext.current()
                .filter(principal -> !principal.hasAnyRole("ADMIN"))
                .map(principal -> sessionRepo.findRecentByUserId(String.valueOf(principal.userId()), limit))
                .orElseGet(() -> sessionRepo.findRecent(limit));
    }

    public ConsultSession get(String sessionId) {
        return requireAccessibleSession(sessionId);
    }

    public List<ConsultTurn> turnsOf(String sessionId) {
        requireAccessibleSession(sessionId);
        return turnRepo.findBySession(sessionId);
    }

    /** 删除会话及其全部轮次与反馈。 */
    public void delete(String sessionId) {
        requireAccessibleSession(sessionId);
        turnRepo.deleteBySession(sessionId);
        feedbackRepo.deleteBySession(sessionId);
        // 抽取台账随会话走：留着会让同 id 的新会话（极端情况）命中旧指纹而被误跳过
        extractionRepo.deleteBySession(sessionId);
        sessionRepo.delete(sessionId);
    }

    private ConsultSession requireAccessibleSession(String sessionId) {
        ConsultSession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> notFound(sessionId));
        AuthContext.current().ifPresent(principal -> {
            boolean admin = principal.hasAnyRole("ADMIN");
            boolean owner = String.valueOf(principal.userId()).equals(session.getUserId());
            if (!admin && !owner) {
                // 对非本人会话统一按不存在处理，避免通过 UUID 探测他人的咨询记录。
                throw notFound(sessionId);
            }
        });
        return session;
    }

    private static ResponseStatusException notFound(String sessionId) {
        return new ResponseStatusException(NOT_FOUND, "咨询会话不存在: " + sessionId);
    }

    private String serializeModules(List<String> modules) {
        if (modules == null || modules.isEmpty()) {
            return null;
        }
        try {
            return mapper.writeValueAsString(modules);
        } catch (Exception e) {
            log.warn("[fore-consult] moduleNames 序列化失败: {}", e.getMessage());
            return null;
        }
    }

    private String serializeAttachments(List<ArchiveRequest.Att> atts) {
        if (atts == null || atts.isEmpty()) {
            return null;
        }
        try {
            return mapper.writeValueAsString(atts);
        } catch (Exception e) {
            log.warn("[fore-consult] 附件序列化失败: {}", e.getMessage());
            return null;
        }
    }

    private static String truncate(String msg) {
        if (msg == null) {
            return "未知错误";
        }
        return msg.length() > 500 ? msg.substring(0, 500) : msg;
    }
}
