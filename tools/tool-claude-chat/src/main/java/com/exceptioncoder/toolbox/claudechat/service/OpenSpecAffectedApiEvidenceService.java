package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.AffectedApiEvidence;
import com.exceptioncoder.toolbox.claudechat.domain.SessionAffectedApi;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAffectedApiRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 将会话接口台账投影为可信的 OpenSpec change 级只读证据。 */
@Service
public class OpenSpecAffectedApiEvidenceService {

    private final SessionAutopilotRepository autopilotRepository;
    private final SessionAffectedApiRepository affectedApiRepository;

    public OpenSpecAffectedApiEvidenceService(SessionAutopilotRepository autopilotRepository,
                                              SessionAffectedApiRepository affectedApiRepository) {
        this.autopilotRepository = autopilotRepository;
        this.affectedApiRepository = affectedApiRepository;
    }

    public List<AffectedApiEvidence> evidence(Path projectDirectory, String changeId) {
        Path normalizedProject = projectDirectory.toAbsolutePath().normalize();
        Map<String, AffectedApiEvidence> latestByEndpoint = new LinkedHashMap<>();
        autopilotRepository.findByChangeId(changeId).stream()
                .filter(run -> sameProject(run, normalizedProject))
                .forEach(run -> affectedApiRepository.findBySessionId(run.sessionId()).stream()
                        .filter(api -> api.updatedAt() >= run.startedAt().toEpochMilli())
                        .forEach(api -> latestByEndpoint.merge(key(api), toEvidence(api),
                                OpenSpecAffectedApiEvidenceService::latest)));
        return latestByEndpoint.values().stream()
                .sorted((left, right) -> right.updatedAt().compareTo(left.updatedAt()))
                .toList();
    }

    private boolean sameProject(SessionAutopilotRun run, Path projectDirectory) {
        try {
            return Path.of(run.context().projectRoot()).toAbsolutePath().normalize().equals(projectDirectory);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private static String key(SessionAffectedApi api) {
        return api.httpMethod().toUpperCase(Locale.ROOT) + " " + api.apiPath();
    }

    private static AffectedApiEvidence toEvidence(SessionAffectedApi api) {
        return new AffectedApiEvidence(api.sessionId(), api.httpMethod(), api.apiPath(), api.changeType(),
                api.sourceFile(), api.handlerName(), api.summary(), api.verificationStatus(),
                api.verificationMethod(), api.verificationSummary(), Instant.ofEpochMilli(api.updatedAt()));
    }

    private static AffectedApiEvidence latest(AffectedApiEvidence left, AffectedApiEvidence right) {
        return left.updatedAt().isAfter(right.updatedAt()) ? left : right;
    }
}
