package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ArchiveRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
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
    private final ObjectMapper mapper = new ObjectMapper();

    public ConsultService(ConsultSessionRepository sessionRepo, ConsultTurnRepository turnRepo) {
        this.sessionRepo = sessionRepo;
        this.turnRepo = turnRepo;
    }

    /** 启动咨询会话：落一条 PENDING 记录。 */
    public ConsultSession startSession(StartSessionRequest req) {
        ConsultSession s = ConsultSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .userId(req.userId())
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
        ConsultSession s = requireSession(sessionId);
        sessionRepo.updateDevSessionId(sessionId, devSessionId);
        s.setDevSessionId(devSessionId);
        return s;
    }

    /**
     * 结束咨询并归档（一次性提交本次会话全部轮次）。容错：轮次写库或状态更新失败时，
     * 会话降级为 FAILED 并记录原因，方法本身不抛异常（会话不存在除外）。
     */
    public ConsultSession archive(String sessionId, ArchiveRequest req) {
        ConsultSession s = requireSession(sessionId);
        long now = System.currentTimeMillis();
        try {
            // 重新归档时先清掉旧轮次，避免重复累积。
            turnRepo.deleteBySession(sessionId);
            List<ArchiveRequest.TurnItem> items = req.turns() != null ? req.turns() : List.of();
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
                        .createdAt(now)
                        .build());
                seq++;
            }
            String parseStatus = req.parseStatus() != null && !req.parseStatus().isBlank()
                    ? req.parseStatus() : "NONE";
            sessionRepo.markArchived(sessionId, req.rawReferenceJson(), parseStatus, now);
            return requireSession(sessionId);
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

    public List<ConsultSession> listRecent(int limit) {
        return sessionRepo.findRecent(limit);
    }

    public ConsultSession get(String sessionId) {
        return requireSession(sessionId);
    }

    public List<ConsultTurn> turnsOf(String sessionId) {
        return turnRepo.findBySession(sessionId);
    }

    /** 删除会话及其全部轮次。 */
    public void delete(String sessionId) {
        turnRepo.deleteBySession(sessionId);
        sessionRepo.delete(sessionId);
    }

    private ConsultSession requireSession(String sessionId) {
        return sessionRepo.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "咨询会话不存在: " + sessionId));
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

    private static String truncate(String msg) {
        if (msg == null) {
            return "未知错误";
        }
        return msg.length() > 500 ? msg.substring(0, 500) : msg;
    }
}
