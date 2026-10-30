package com.exceptioncoder.toolbox.foreconsult.service;

import static org.springframework.http.HttpStatus.*;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.foreconsult.api.dto.DispatchConsultRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultClientRequestRepository;
import com.exceptioncoder.toolbox.llm.spi.ConsultClientApplication;
import com.exceptioncoder.toolbox.llm.spi.ConsultClientRuntime;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Reuses the same initial/follow-up pipeline as the business workspace. */
@Service
public class ConsultClientApplicationService
    implements ConsultClientApplication
{

    private final ConsultService sessions;
    private final ConsultSourceRoutingService source;
    private final ConsultDispatchService dispatch;
    private final ConsultWorkflowSessionService workflows;
    private final ConsultClientRuntime runtime;
    private final ConsultClientRequestRepository requests;
    private final ObjectMapper mapper;
    private final TransactionTemplate transaction;
    private final Object[] locks = java.util.stream.IntStream.range(0, 64)
        .mapToObj(i -> new Object())
        .toArray();

    public ConsultClientApplicationService(
        ConsultService sessions,
        ConsultSourceRoutingService source,
        ConsultDispatchService dispatch,
        ConsultWorkflowSessionService workflows,
        ConsultClientRuntime runtime,
        ConsultClientRequestRepository requests,
        ObjectMapper mapper,
        PlatformTransactionManager manager
    ) {
        this.sessions = sessions;
        this.source = source;
        this.dispatch = dispatch;
        this.workflows = workflows;
        this.runtime = runtime;
        this.requests = requests;
        this.mapper = mapper;
        this.transaction = new TransactionTemplate(manager);
    }

    @Override
    public Prepared prepare(
        String requestId,
        String consultationId,
        String question,
        List<String> attachmentIds
    ) {
        if (
            requestId == null || !requestId.matches("[A-Za-z0-9_-]{8,100}")
        ) throw new IllegalArgumentException("requestId 格式无效");
        if (
            question == null || question.isBlank() || question.length() > 4000
        ) throw new IllegalArgumentException("问题须为 1–4000 字符");
        String user = owner();
        synchronized (
            locks[Math.floorMod((user + requestId).hashCode(), locks.length)]
        ) {
            return transaction.execute(status -> {
                String hash = digest(
                    question + "\n" + String.join(",", attachmentIds)
                );
                var saved = requests.find(user, requestId);
                if (saved.isPresent()) {
                    if (
                        !saved.get().hash().equals(hash) ||
                        (consultationId != null &&
                            !consultationId.equals(
                                saved.get().consultationId()
                            ))
                    ) throw new ResponseStatusException(
                        CONFLICT,
                        "请求标识已用于不同内容或咨询"
                    );
                    return new Prepared(
                        require(saved.get().consultationId(), true),
                        saved.get().prompt()
                    );
                }
                ConsultSession session;
                String prompt;
                if (consultationId == null || consultationId.isBlank()) {
                    String title =
                        LocalDate.now().format(
                            DateTimeFormatter.ofPattern("yyMMdd")
                        ) +
                        "-" +
                        question.replaceAll("\\s+", " ");
                    title = title.substring(0, Math.min(40, title.length()));
                    var request = new StartSessionRequest(
                        null,
                        null,
                        List.of(),
                        title,
                        question,
                        null,
                        "BIZ",
                        "codex",
                        null,
                        null,
                        null,
                        null,
                        "v4",
                        true
                    );
                    var prepared = source.prepare(request);
                    var initial = source.decorate(
                        dispatch.initial(prepared.request()),
                        prepared.scope()
                    );
                    session = workflows.start(prepared.request(), initial);
                    String runtimeId = UUID.randomUUID().toString();
                    List<String> systems;
                    try {
                        systems = mapper.readValue(
                            session.getEvidenceSystems(),
                            new TypeReference<List<String>>() {}
                        );
                    } catch (Exception error) {
                        throw new IllegalStateException(
                            "咨询范围读取失败",
                            error
                        );
                    }
                    runtime.create(
                        new ConsultClientRuntime.Definition(
                            runtimeId,
                            Long.parseLong(user),
                            session.getQuestionTitle(),
                            session.getSystemSourcePath(),
                            session.getModel(),
                            session.getCodexHome(),
                            systems
                        )
                    );
                    sessions.linkDevSession(session.getSessionId(), runtimeId);
                    prompt = session.getPromptSnapshot();
                } else {
                    require(consultationId, true);
                    session = sessions.get(consultationId);
                    var result = dispatch.followUp(
                        session,
                        new DispatchConsultRequest(
                            question,
                            null,
                            true,
                            "codex"
                        )
                    );
                    if (
                        !"SEND".equals(result.action())
                    ) throw new ResponseStatusException(
                        CONFLICT,
                        "该问题需要新建咨询"
                    );
                    prompt = result.prompt();
                }
                requests.save(
                    user,
                    requestId,
                    session.getSessionId(),
                    hash,
                    prompt
                );
                return new Prepared(
                    require(session.getSessionId(), true),
                    prompt
                );
            });
        }
    }

    @Override
    public Bound require(String consultationId, boolean writable) {
        var session = sessions.get(consultationId);
        // External APIs deliberately do not inherit the administrator's cross-user browsing exception.
        if (
            !owner().equals(session.getUserId())
        ) throw new ResponseStatusException(FORBIDDEN, "只能访问本人咨询");
        if (
            writable && !"PENDING".equals(session.getArchiveStatus())
        ) throw new ResponseStatusException(CONFLICT, "咨询已归档，只能读取");
        if (
            session.getDevSessionId() == null
        ) throw new ResponseStatusException(
            CONFLICT,
            "该咨询尚未关联运行会话，请从平台恢复后重试"
        );
        return new Bound(
            session.getSessionId(),
            session.getDevSessionId(),
            session.getQuestionTitle(),
            session.getArchiveStatus()
        );
    }

    private String owner() {
        return String.valueOf(
            AuthContext.current()
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED))
                .userId()
        );
    }

    private String digest(String value) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(
                    value.getBytes(StandardCharsets.UTF_8)
                )
            );
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }
}
