package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.eval.EvalSampleSource;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** 从已筛选的真实历史轮次生成业务咨询快速回归集。 */
@Slf4j
@Component
public class BusinessConsultSmokeSampleSource implements EvalSampleSource {

    private static final String DATASET = "business-consult-smoke-v1";
    private static final List<HistoricalTurn> CLASSIC_TURNS = List.of(
            new HistoricalTurn("16a4b0ab-c041-4ea0-a030-8a7503af9757", 1, "SCM 系统全景梳理"),
            new HistoricalTurn("565ba95e-12f6-4afc-97a8-c111c0213e77", 1, "SRM 系统全景梳理"),
            new HistoricalTurn("998705c3-7cac-49a4-b9c0-64e78a3151e9", 1, "打版工作台业务规则"),
            new HistoricalTurn("cc749cd0-5e7b-4e19-9bb3-b1057403fd0b", 5, "订单看板字段溯源"),
            new HistoricalTurn("a40d9868-5d3b-44de-863d-87f07913355c", 8, "仓库权限配置"),
            new HistoricalTurn("9be3b87a-3ce7-4115-993b-2a5975a85b35", 1, "销售单数据权限排查"));

    private final ConsultSessionRepository sessionRepository;
    private final ConsultTurnRepository turnRepository;
    private final ObjectMapper mapper;

    public BusinessConsultSmokeSampleSource(ConsultSessionRepository sessionRepository,
                                            ConsultTurnRepository turnRepository,
                                            ObjectMapper mapper) {
        this.sessionRepository = sessionRepository;
        this.turnRepository = turnRepository;
        this.mapper = mapper;
    }

    @Override
    public String id() {
        return DATASET;
    }

    @Override
    public String displayName() {
        return "业务咨询 · 经典历史问题快速回归（Smoke Test）";
    }

    @Override
    public String scenario() {
        return "business_consult";
    }

    @Override
    public List<Sample> collect() {
        List<Sample> samples = new ArrayList<>();
        for (HistoricalTurn classic : CLASSIC_TURNS) {
            sessionRepository.findById(classic.sessionId())
                    .flatMap(session -> findTurn(session, classic.turnIndex()))
                    .map(turn -> toSample(classic, turn.session(), turn.turn()))
                    .ifPresent(samples::add);
        }
        return List.copyOf(samples);
    }

    private Optional<SessionTurn> findTurn(ConsultSession session, int turnIndex) {
        if (session.getSystemSourcePath() == null || session.getSystemSourcePath().isBlank()) {
            log.warn("经典回归样本缺少源码路径，跳过 sessionId={}", session.getSessionId());
            return Optional.empty();
        }
        return turnRepository.findBySession(session.getSessionId()).stream()
                .filter(turn -> turn.getTurnIndex() == turnIndex)
                .filter(turn -> turn.getQuestion() != null && !turn.getQuestion().isBlank())
                .map(turn -> new SessionTurn(session, turn))
                .findFirst();
    }

    private Sample toSample(HistoricalTurn classic, ConsultSession session, ConsultTurn turn) {
        ObjectNode input = mapper.createObjectNode();
        input.put("question", turn.getQuestion());
        input.put("system", session.getSystemName());
        input.set("modules", parseModules(session.getModuleNames()));
        input.put("role", session.getRole() == null ? "IT" : session.getRole());

        ObjectNode context = input.putObject("sessionContext");
        context.put("sourcePath", session.getSystemSourcePath());
        context.put("orchestrationVersion", "v4");
        context.put("engine", session.getEngine() == null ? "codex" : session.getEngine());
        context.put("reasoningEffort", "low");
        context.put("speed", "default");

        ObjectNode expected = mapper.createObjectNode();
        expected.put("minEvidenceCount", 1);
        expected.put("maxToolCalls", 20);
        expected.put("noRepeatedToolCall", true);

        ArrayNode tags = mapper.createArrayNode();
        tags.add("historical");
        tags.add("smoke-test");
        tags.add("pending-human-baseline");
        return new Sample(
                "consult_smoke:" + classic.sessionId() + "#" + classic.turnIndex(),
                classic.title(), input.toString(), expected.toString(), null, tags.toString());
    }

    private ArrayNode parseModules(String raw) {
        if (raw == null || raw.isBlank()) {
            return mapper.createArrayNode();
        }
        try {
            JsonNode parsed = mapper.readTree(raw);
            return parsed.isArray() ? (ArrayNode) parsed : mapper.createArrayNode();
        } catch (Exception exception) {
            log.warn("经典回归样本的模块快照不是合法 JSON，按空模块处理", exception);
            return mapper.createArrayNode();
        }
    }

    private record HistoricalTurn(String sessionId, int turnIndex, String title) {
    }

    private record SessionTurn(ConsultSession session, ConsultTurn turn) {
    }
}
