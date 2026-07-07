package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 会话编排核心。
 *
 * 维护「浏览器连接 ↔ 会话 ↔ sidecar」三方映射，双向转发消息；
 * 每会话维护环形事件缓冲支持断连重连回放；会话结束触发完成通知。
 *
 * 浏览器与会话是多对一：手机切前台/重连不杀会话，任务在 sidecar 持续跑。
 */
@Slf4j
@Service
public class ClaudeChatService {

    private final ClaudeChatProperties props;
    private final ClaudeChatSessionRepository repo;
    private final SidecarProcessRegistry processRegistry;
    private final SidecarClient sidecar;
    private final NotificationService notifications;
    private final AttachmentStorageService attachments;
    private final AgentOneShotService agentOneShot;
    private final ProviderModelService providerModels;
    private final WelfareDemoSandboxProvisioner welfareDemo;
    private final ObjectMapper mapper;

    /** sessionId -> 运行时上下文 */
    private final Map<String, SessionCtx> sessions = new ConcurrentHashMap<>();
    /** 浏览器 wsId -> sessionId，便于按浏览器连接定位会话 */
    private final Map<String, String> wsToSession = new ConcurrentHashMap<>();
    /** 后台 sidecar 重连任务的去重锁，避免多次断开叠起多个重连循环 */
    private final AtomicBoolean recovering = new AtomicBoolean(false);

    public ClaudeChatService(ClaudeChatProperties props,
                             ClaudeChatSessionRepository repo,
                             SidecarProcessRegistry processRegistry,
                             SidecarClient sidecar,
                             NotificationService notifications,
                             AttachmentStorageService attachments,
                             AgentOneShotService agentOneShot,
                             ProviderModelService providerModels,
                             WelfareDemoSandboxProvisioner welfareDemo,
                             ObjectMapper mapper) {
        this.props = props;
        this.repo = repo;
        this.processRegistry = processRegistry;
        this.sidecar = sidecar;
        this.notifications = notifications;
        this.attachments = attachments;
        this.agentOneShot = agentOneShot;
        this.providerModels = providerModels;
        this.welfareDemo = welfareDemo;
        this.mapper = mapper;
    }

    @PostConstruct
    void wireSidecar() {
        sidecar.setListener(this::onSidecarEvent);
    }

    // ===== 浏览器侧入口（由 WebSocketHandler 调用） =====

    public void openSession(WebSocketSession ws, ClientMessage.Open open) {
        if (!ensureSidecar(ws)) return;
        String sessionId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        String cwd = open.cwd() == null || open.cwd().isBlank()
                ? System.getProperty("user.home") : open.cwd().trim();

        String engine = normalizeEngine(open.engine());
        // 第三方网关对 Claude / Codex / Gemini 引擎生效（Claude→Anthropic 兼容、Codex→OpenAI 兼容、
        // Gemini→Google 兼容，各走各的协议端点）；opencode 自管 provider，忽略网关参数。
        boolean gatewayCapable = "claude".equals(engine) || "codex".equals(engine) || "gemini".equals(engine);
        String apiBaseUrl = gatewayCapable ? blankToNull(open.apiBaseUrl()) : null;
        String authToken = apiBaseUrl == null ? null : blankToNull(open.authToken());
        repo.insert(ClaudeChatSession.builder()
                .id(sessionId).cwd(cwd).title(null).sdkSessionId(null).engine(engine)
                .apiBaseUrl(apiBaseUrl).authToken(authToken)
                .status(SessionStatus.IDLE).startedAt(now).lastSeenAt(now).build());

        SessionCtx ctx = new SessionCtx(sessionId, cwd);
        ctx.engine = engine;
        ctx.apiBaseUrl = apiBaseUrl;
        ctx.authToken = authToken;
        ctx.currentModel = blankToNull(open.model()); // 网关默认模型，供菜单高亮当前项
        sessions.put(sessionId, ctx);
        bindViewer(ws, ctx);

        ctx.mode = normalizeMode(open.mode());
        sidecar.startSession(sessionId, cwd, open.model(), ctx.mode, engine, apiBaseUrl, authToken);
        pushGatewayModels(ctx); // 网关会话：拉网关 /v1/models 目录推给前端，命令菜单据此选/切模型
        log.info("[claude-chat] open 会话 {} cwd={} mode={} engine={}", sessionId, cwd, ctx.mode, engine);
    }

    /**
     * 福利签收演示会话：cwd 已是供给好的一次性副本根，demo=true 透传给 sidecar 走沙箱硬裁决。
     * 演示会话不持久化（不入 claude_chat_session，故不进正式会话列表），随浏览器断连即销毁副本。
     */
    public void openDemoSession(WebSocketSession ws, String sessionId, String cwd, String demoApiBase) {
        if (!ensureSidecar(ws)) return;
        SessionCtx ctx = new SessionCtx(sessionId, cwd);
        ctx.engine = "claude";
        ctx.mode = "default";
        ctx.demo = true;
        sessions.put(sessionId, ctx);
        bindViewer(ws, ctx);
        sidecar.startDemoSession(sessionId, cwd, demoApiBase);
        log.info("[claude-chat] open 演示会话 {} cwd={}", sessionId, cwd);
    }

    public void attach(WebSocketSession ws, ClientMessage.Attach attach) {
        SessionCtx ctx = sessions.get(attach.sessionId());
        if (ctx == null) {
            // 后端重启过 → 内存会话已清空；若 DB 仍有该会话，自动从持久化记录 resume 恢复，免去用户手动重开
            ClaudeChatSession db = repo.findById(attach.sessionId()).orElse(null);
            if (db != null && ensureSidecar(ws)) {
                // computeIfAbsent 原子去重：并发 attach 同一会话时 lambda 只跑一次，
                // 只有真正新建 ctx 的那条线程才 resume（否则两条都 resume → sidecar 重复续跑）
                boolean[] created = {false};
                SessionCtx restored = sessions.computeIfAbsent(db.getId(), id -> {
                    created[0] = true;
                    SessionCtx c = new SessionCtx(id, db.getCwd());
                    c.sdkSessionId = db.getSdkSessionId();
                    c.engine = normalizeEngine(db.getEngine());
                    c.apiBaseUrl = db.getApiBaseUrl();
                    c.authToken = db.getAuthToken();
                    loadEngineSessions(c, db.getEngineSessions());
                    return c;
                });
                bindViewer(ws, restored);
                if (created[0]) {
                    repo.touch(db.getId(), SessionStatus.IDLE, System.currentTimeMillis());
                    sidecar.resumeSession(db.getId(), db.getSdkSessionId(), db.getCwd(), restored.engine, restored.apiBaseUrl, restored.authToken);
                    log.info("[claude-chat] attach 内存未命中，从 DB 恢复并 resume 会话 {}", db.getId());
                }
                // Ready 只发给当前这条连接（其它已在看的连接不需要重复）
                writeTo(ws, ready(restored));
                pushGatewayModels(restored); // 重连恢复网关会话：重发网关模型目录
                return;
            }
            sendError(ws, 0, "SESSION_NOT_FOUND", "会话不存在或已结束，请切换或新建");
            return;
        }
        bindViewer(ws, ctx);
        warnIfReplayGap(ctx, ws, attach.lastEventSeq());
        replayBuffer(ctx, ws, attach.lastEventSeq());
        redeliverPending(ctx, ws, attach.lastEventSeq());
        ensureSessionResumable(ctx); // sidecar 也断了的话借浏览器重连顺带恢复
        // 回推一次会话状态：让重连端按 status 同步 running，纠正「result 已被缓冲淘汰 → 永久卡在正在思考」
        writeTo(ws, ready(ctx));
        pushGatewayModels(ctx); // 网关会话重连：重发网关模型目录
        log.info("[claude-chat] attach 会话 {} from seq>{}", ctx.sessionId, attach.lastEventSeq());
    }

    public void switchSession(WebSocketSession ws, ClientMessage.SwitchSession msg) {
        if (!ensureSidecar(ws)) return;
        ClaudeChatSession db = repo.findById(msg.sessionId()).orElse(null);
        if (db == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "会话不存在");
            return;
        }
        SessionCtx ctx = sessions.computeIfAbsent(db.getId(), id -> new SessionCtx(id, db.getCwd()));
        ctx.sdkSessionId = db.getSdkSessionId();
        ctx.engine = normalizeEngine(db.getEngine());
        ctx.apiBaseUrl = db.getApiBaseUrl();
        ctx.authToken = db.getAuthToken();
        loadEngineSessions(ctx, db.getEngineSessions());
        bindViewer(ws, ctx);
        // 只更新 lastSeenAt，保留会话真实状态：若该会话仍有在跑的一轮（ctx 内存中为 RUNNING），
        // 切回/刷新恢复时不能把 DB 状态抹成 IDLE，否则会话列表与前端 running 判定都会误判为「空闲」。
        repo.touch(db.getId(), ctx.status, System.currentTimeMillis());
        sidecar.resumeSession(db.getId(), db.getSdkSessionId(), db.getCwd(), ctx.engine, ctx.apiBaseUrl, ctx.authToken);
        // 历史消息由前端按需读 SDK transcript；这里只发一个 Ready 表示已就绪
        sendToBrowser(ctx, seq -> ready(ctx, seq));
        pushGatewayModels(ctx); // 切到网关会话：重发网关模型目录，命令菜单可选/切
    }

    /** 续跑磁盘上的历史会话：建一条本工具的元数据行后 resume，之后它也出现在工具会话列表里。 */
    public void resumeHistory(WebSocketSession ws, ClientMessage.ResumeHistory msg) {
        if (!ensureSidecar(ws)) return;
        if (msg.sdkSessionId() == null || msg.sdkSessionId().isBlank()) {
            sendError(ws, 0, "BAD_MESSAGE", "缺少 sdkSessionId");
            return;
        }
        String id = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        String cwd = msg.cwd() == null || msg.cwd().isBlank()
                ? System.getProperty("user.home") : msg.cwd().trim();

        repo.insert(ClaudeChatSession.builder()
                .id(id).cwd(cwd).title(null).sdkSessionId(msg.sdkSessionId()).engine("claude")
                .status(SessionStatus.IDLE).startedAt(now).lastSeenAt(now).build());

        SessionCtx ctx = new SessionCtx(id, cwd);
        ctx.sdkSessionId = msg.sdkSessionId();
        sessions.put(id, ctx);
        bindViewer(ws, ctx);

        sidecar.resumeSession(id, msg.sdkSessionId(), cwd, ctx.engine, ctx.apiBaseUrl, ctx.authToken);
        sendToBrowser(ctx, seq -> ready(ctx, seq));
        log.info("[claude-chat] resumeHistory 会话 {} sdk={} cwd={}", id, msg.sdkSessionId(), cwd);
    }

    public void resumeCurrent(WebSocketSession ws, ClientMessage.ResumeCurrent msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null && msg.sessionId() != null && !msg.sessionId().isBlank()) {
            String sessionId = msg.sessionId().trim();
            ctx = sessions.get(sessionId);
            if (ctx == null) {
                ClaudeChatSession db = repo.findById(sessionId).orElse(null);
                if (db != null) {
                    SessionCtx restored = new SessionCtx(db.getId(), db.getCwd());
                    restored.sdkSessionId = db.getSdkSessionId();
                    restored.engine = normalizeEngine(db.getEngine());
                    restored.apiBaseUrl = db.getApiBaseUrl();
                    restored.authToken = db.getAuthToken();
                    loadEngineSessions(restored, db.getEngineSessions());
                    sessions.put(restored.sessionId, restored);
                    ctx = restored;
                }
            }
            if (ctx != null) bindViewer(ws, ctx);
        }
        if (ctx == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "请先 open 或 attach 会话");
            return;
        }
        if (!ensureSidecar(ws)) return;

        ClaudeChatSession db = repo.findById(ctx.sessionId).orElse(null);
        if (db != null) {
            if (ctx.sdkSessionId == null || ctx.sdkSessionId.isBlank()) {
                ctx.sdkSessionId = db.getSdkSessionId();
            }
            if (ctx.engineSessions.isEmpty()) {
                loadEngineSessions(ctx, db.getEngineSessions());
            }
        }
        String sdkSessionId = blankToNull(ctx.engineSessions.get(ctx.engine));
        if (sdkSessionId == null) sdkSessionId = blankToNull(ctx.sdkSessionId);
        if (sdkSessionId == null) {
            sendToBrowser(ctx, seq -> new ServerMessage.Error(
                    seq, "SESSION_NOT_RESUMABLE", "当前 agent 还没有可 resume 的原生会话"));
            return;
        }

        ctx.sdkSessionId = sdkSessionId;
        ctx.status = SessionStatus.IDLE;
        ctx.pendingRequest = null;
        repo.updateSdkSessionId(ctx.sessionId, sdkSessionId);
        repo.touch(ctx.sessionId, SessionStatus.IDLE, System.currentTimeMillis());
        sidecar.resumeSession(ctx.sessionId, sdkSessionId, ctx.cwd, ctx.engine, ctx.apiBaseUrl, ctx.authToken);
        final SessionCtx readyCtx = ctx; // ctx 在本方法上方被重新赋值（attach 恢复），lambda 捕获需 effectively final
        sendToBrowser(ctx, seq -> ready(readyCtx, seq));
        pushGatewayModels(ctx);
        log.info("[claude-chat] resumeCurrent session={} engine={} sdk={}", ctx.sessionId, ctx.engine, sdkSessionId);
    }

    public void sendUserMessage(WebSocketSession ws, ClientMessage.Send msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "请先 open 或 attach 会话");
            return;
        }
        if (!ensureSessionResumable(ctx)) return; // sidecar 断了先就地重连+resume，避免静默丢消息
        ctx.status = SessionStatus.RUNNING;
        repo.touch(ctx.sessionId, SessionStatus.RUNNING, System.currentTimeMillis());
        sidecar.userMessage(ctx.sessionId, appendAttachmentHints(msg.text(), msg.attachments()));
    }

    /** 把附件路径以结构化提示拼到用户文本末尾，让 Claude 自行 Read；无附件则原样返回。 */
    private String appendAttachmentHints(String text, List<ClientMessage.Send.Attachment> atts) {
        if (atts == null || atts.isEmpty()) {
            return text;
        }
        StringBuilder sb = new StringBuilder(text == null ? "" : text);
        sb.append("\n\n[附件] 用户上传了以下文件，需要时请用 Read 工具查看：");
        for (ClientMessage.Send.Attachment a : atts) {
            sb.append("\n- ").append(a.name()).append(" → ").append(a.path());
        }
        return sb.toString();
    }

    public void decision(WebSocketSession ws, ClientMessage.Decision msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null) {
            log.warn("[claude-chat] 收到决策但 ws 未绑定会话，丢弃 reqId={}", msg.reqId());
            return;
        }
        boolean delivered = sidecar.decision(ctx.sessionId, msg.reqId(), msg.behavior(),
                msg.updatedInput(), msg.answers());
        if (!delivered) {
            // sidecar 断开时决策送不到（前端已乐观关弹窗）：明确回告未送达，别让用户误以为已批准而干等超时。
            // 不清 pendingRequest、不广播「已解决」，重连 attach 时可重投该请求。
            sendToBrowser(ctx, seq -> new ServerMessage.Error(seq, "DECISION_UNDELIVERED",
                    "确认未送达：sidecar 已断开，正在自动重连。重连后请对该操作重新确认或用「原生 resume」继续。"));
            return;
        }
        ctx.pendingRequest = null;
        // 多端同看：广播「该请求已被处理」，让其它客户端关掉同一个弹窗
        sendToBrowser(ctx, seq -> new ServerMessage.DecisionResolved(seq, msg.reqId()));
    }

    /** 切换会话权限模式，下一轮 query 生效；非法值拒绝。 */
    public void setMode(WebSocketSession ws, ClientMessage.SetMode msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "请先 open 或 attach 会话");
            return;
        }
        if (!isValidMode(msg.mode())) {
            sendError(ws, 0, "BAD_MODE", "非法权限模式：" + msg.mode());
            return;
        }
        ctx.mode = msg.mode();
        sidecar.setMode(ctx.sessionId, ctx.mode);
        log.info("[claude-chat] 会话 {} 切换权限模式 -> {}", ctx.sessionId, ctx.mode);
    }

    /** 切换会话模型，下一轮 query 生效；广播当前模型让多端同步勾选。 */
    public void setModel(WebSocketSession ws, ClientMessage.SetModel msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "请先 open 或 attach 会话");
            return;
        }
        ctx.currentModel = msg.model();
        sidecar.setModel(ctx.sessionId, msg.model());
        sendToBrowser(ctx, seq -> new ServerMessage.Models(seq, ctx.models, ctx.currentModel));
        log.info("[claude-chat] 会话 {} 切换模型 -> {}", ctx.sessionId, msg.model());
    }

    /**
     * 会话内切 agent（引擎）：同一会话 id 不变。保存离开引擎的句柄，切回曾用引擎则 resume 其原生会话
     * （sdkSessionId 从持久化映射取出，跨 sidecar 重启也精准），首次切到则新建；追加引擎顺序用于列表标记。
     */
    public void switchEngine(WebSocketSession ws, ClientMessage.SwitchEngine msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "请先 open 或 attach 会话");
            return;
        }
        String engine = normalizeEngine(msg.engine());
        if (engine.equals(ctx.engine)) return; // 同引擎无需切
        String prev = repo.findById(ctx.sessionId).map(ClaudeChatSession::getEngines).orElse(null);
        String engines = appendEngine(prev, ctx.engine, engine);
        if (ctx.sdkSessionId != null && !ctx.sdkSessionId.isBlank()) {
            ctx.engineSessions.put(ctx.engine, ctx.sdkSessionId); // 存离开引擎的句柄
        }
        String target = ctx.engineSessions.get(engine);          // 切回则有原生句柄，首次为 null
        ctx.engine = engine;
        ctx.sdkSessionId = target;
        repo.switchEngine(ctx.sessionId, engine, engines, target, writeEngineSessions(ctx.engineSessions));
        sidecar.switchEngine(ctx.sessionId, engine, target, ctx.apiBaseUrl, ctx.authToken);
        log.info("[claude-chat] 会话 {} 切 agent -> {}（engines={}，resume={}）",
                ctx.sessionId, engine, engines, target != null);
    }

    /**
     * 会话内切服务商（官方 ↔ 第三方网关，或两网关互切）：同一会话 id 与 sdkSessionId 不变，沿用原生会话续跑
     * （保留上下文）。更新 ctx + DB + 透传 sidecar（下一轮生效），并刷新模型目录（网关→拉其 /v1/models，
     * 官方→清空让 sidecar 的 supportedModels 重新接管），最后重发 Ready 让多端同步 provider 标识。
     */
    public void switchProvider(WebSocketSession ws, ClientMessage.SwitchProvider msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "请先 open 或 attach 会话");
            return;
        }
        // 仅 claude/codex/gemini 走第三方网关；opencode 自管 provider，拒绝切换避免无效状态
        boolean gatewayCapable = "claude".equals(ctx.engine) || "codex".equals(ctx.engine) || "gemini".equals(ctx.engine);
        String apiBaseUrl = gatewayCapable ? blankToNull(msg.apiBaseUrl()) : null;
        String authToken = apiBaseUrl == null ? null : blankToNull(msg.authToken());
        if (!gatewayCapable && blankToNull(msg.apiBaseUrl()) != null) {
            sendError(ws, 0, "PROVIDER_UNSUPPORTED", "当前 agent 不支持第三方网关");
            return;
        }

        ctx.apiBaseUrl = apiBaseUrl;
        ctx.authToken = authToken;
        // 切到官方：清掉网关模型目录，下一轮由 sidecar supportedModels 重新下发；切到网关：下方异步拉取覆盖
        if (apiBaseUrl == null) {
            ctx.models = List.of();
            ctx.currentModel = null;
        }
        repo.updateProvider(ctx.sessionId, apiBaseUrl, authToken);
        sidecar.switchProvider(ctx.sessionId, apiBaseUrl, authToken);
        sendToBrowser(ctx, seq -> ready(ctx, seq)); // 重发 Ready：providerKind/baseUrl 同步到所有看此会话的端
        pushGatewayModels(ctx);                      // 网关会话拉模型目录；官方会话内部直接跳过
        log.info("[claude-chat] 会话 {} 切服务商 -> {}", ctx.sessionId, apiBaseUrl == null ? "官方登录" : apiBaseUrl);
    }

    /**
     * 维护「本会话用过哪些 agent」的去重有序集合（首次出现序）。
     *
     * <p>切回曾用引擎会 resume 它的原生会话（句柄存于 engine_sessions），并非新建——故标记应是
     * 「用过的 agent 集合」而非每次切换的完整往返流水。早期实现按流水追加，来回切几次就变成
     * {@code claude,codex,claude,codex,…}，列表标记看起来像「一直新增会话」。这里改为并集去重：
     * 来回切只保留 {@code claude,codex}，与实际可 resume 的 agent 一一对应。
     */
    private static String appendEngine(String existing, String base, String next) {
        String csv = (existing == null || existing.isBlank())
                ? (base == null ? "claude" : base) : existing;
        java.util.LinkedHashSet<String> set = new java.util.LinkedHashSet<>();
        for (String p : csv.split(",")) {
            String t = p.trim();
            if (!t.isEmpty()) set.add(t);
        }
        set.add(next); // 已用过则不重复（resume 续接，不算新增）
        return String.join(",", set);
    }

    /** 序列化各引擎句柄映射为 JSON 持久化；失败回 null（降级丢映射，不影响主流程）。 */
    private String writeEngineSessions(Map<String, String> m) {
        try {
            return m.isEmpty() ? null : mapper.writeValueAsString(m);
        } catch (Exception e) {
            return null;
        }
    }

    /** 从 DB 的 JSON 反序列化各引擎句柄映射到 ctx（恢复会话时调用）。 */
    @SuppressWarnings("unchecked")
    private void loadEngineSessions(SessionCtx ctx, String json) {
        if (json == null || json.isBlank()) return;
        try {
            Map<String, String> m = mapper.readValue(json, Map.class);
            ctx.engineSessions.putAll(m);
        } catch (Exception e) {
            log.debug("[claude-chat] engine_sessions 解析失败，忽略：{}", e.getMessage());
        }
    }

    /** 构造 Ready：附带安全的 provider 展示信息，绝不回传 authToken。 */
    private ServerMessage.Ready ready(SessionCtx ctx) {
        return ready(ctx, ctx.seq.incrementAndGet());
    }

    private ServerMessage.Ready ready(SessionCtx ctx, long seq) {
        String providerBaseUrl = blankToNull(ctx.apiBaseUrl);
        String providerKind = providerBaseUrl == null ? "official" : "thirdParty";
        return new ServerMessage.Ready(seq, ctx.sessionId, ctx.sdkSessionId, ctx.slashCommands,
                ctx.status.name(), ctx.epoch, ctx.engine, providerKind, providerBaseUrl,
                ctx.skills, ctx.agents, ctx.mcpServers, ctx.outputStyle);
    }

    /**
     * 网关会话：异步拉取网关 {@code /v1/models} 目录并以 {@code Models} 事件推给前端，
     * 让会话内命令菜单据此选/切模型（复用既有 setModel 链路）。非网关会话直接跳过——
     * 官方模型清单仍由 sidecar 的 supportedModels 提供。HTTP 调用放虚拟线程，不阻塞 WS 处理。
     */
    private void pushGatewayModels(SessionCtx ctx) {
        if (ctx.apiBaseUrl == null || ctx.apiBaseUrl.isBlank()) return;
        Thread.ofVirtual().name("claude-chat-gw-models").start(() -> {
            List<ModelInfo> models = providerModels.fetchModels(ctx.apiBaseUrl, ctx.authToken);
            if (models.isEmpty()) return;
            ctx.models = models;
            sendToBrowser(ctx, seq -> new ServerMessage.Models(seq, ctx.models, ctx.currentModel));
        });
    }

    private static boolean isValidMode(String m) {
        return "default".equals(m) || "acceptEdits".equals(m)
                || "plan".equals(m) || "bypassPermissions".equals(m);
    }

    private static String normalizeMode(String m) {
        return isValidMode(m) ? m : "default";
    }

    private static String normalizeEngine(String e) {
        return "codex".equals(e) || "gemini".equals(e) || "opencode".equals(e) ? e : "claude";
    }

    public void interrupt(WebSocketSession ws) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx != null) sidecar.interrupt(ctx.sessionId);
    }

    /**
     * 从当前会话的某条用户消息分叉出新会话（旧会话保留不动）。
     * sidecar 完成 forkSession 后回 {@code forked}，届时建一条会话元数据行并通知前端切换续跑。
     */
    public void forkSession(WebSocketSession ws, ClientMessage.ForkSession msg) {
        SessionCtx ctx = ctxOf(ws);
        if (ctx == null) {
            sendError(ws, 0, "SESSION_NOT_FOUND", "请先 open 或 attach 会话");
            return;
        }
        if (msg.upToMessageId() == null || msg.upToMessageId().isBlank()) {
            sendError(ws, 0, "BAD_MESSAGE", "缺少分叉锚点消息");
            return;
        }
        if (!ensureSessionResumable(ctx)) return;
        sidecar.forkSession(ctx.sessionId, msg.upToMessageId());
        log.info("[claude-chat] 会话 {} 请求分叉 upTo={}", ctx.sessionId, msg.upToMessageId());
    }

    /** 浏览器连接断开：仅把该连接从会话观察者集合移除（不杀会话，其它端可继续看，任务在 sidecar 跑）。 */
    public void onBrowserDisconnected(WebSocketSession ws) {
        String sessionId = wsToSession.remove(ws.getId());
        if (sessionId == null) return;
        SessionCtx ctx = sessions.get(sessionId);
        if (ctx == null) return;
        ctx.viewers.remove(ws);
        // 演示会话是一次性的：最后一个观察者断开即中断并销毁副本（不像正式会话那样留在 sidecar 续跑）。
        if (ctx.demo && !hasActiveViewer(ctx)) {
            sidecar.interrupt(sessionId);
            sessions.remove(sessionId);
            welfareDemo.dispose(sessionId);
            log.info("[claude-chat] 演示会话 {} 断开，已销毁副本", sessionId);
        }
    }

    // ===== sidecar 侧事件（由 SidecarClient 回调） =====

    void onSidecarEvent(String sessionId, JsonNode node) {
        // 连接级事件：sidecar 崩溃/断开
        if (sessionId == null || node == null) {
            onSidecarDown();
            return;
        }
        // 一次性 Agent 任务（高质量简历优化等）：不走会话逻辑，转交 AgentOneShotService。
        if (sessionId.startsWith("oneshot:")) {
            agentOneShot.handle(sessionId, node);
            return;
        }
        SessionCtx ctx = sessions.get(sessionId);
        if (ctx == null) return;
        String type = node.path("type").asText("");
        switch (type) {
            case "init" -> {
                ctx.sdkSessionId = node.path("sdkSessionId").asText(null);
                ctx.slashCommands = parseStringList(node.get("slashCommands"));
                ctx.skills = parseStringList(node.get("skills"));
                ctx.agents = parseStringList(node.get("agents"));
                ctx.mcpServers = parseMcpServers(node.get("mcpServers"));
                ctx.outputStyle = node.hasNonNull("outputStyle") ? node.get("outputStyle").asText() : null;
                repo.updateSdkSessionId(sessionId, ctx.sdkSessionId);
                // 记录当前引擎拿到的句柄，持久化各引擎句柄映射（跨重启精准切回 + 增量）
                if (ctx.sdkSessionId != null && !ctx.sdkSessionId.isBlank()) {
                    ctx.engineSessions.put(ctx.engine, ctx.sdkSessionId);
                    repo.updateEngineSessions(sessionId, writeEngineSessions(ctx.engineSessions));
                }
                sendToBrowser(ctx, seq -> ready(ctx, seq));
            }
            case "assistantDelta" -> sendToBrowser(ctx,
                    seq -> new ServerMessage.AssistantDelta(seq, node.path("text").asText("")));
            case "toolUse" -> sendToBrowser(ctx, seq -> new ServerMessage.ToolUse(
                    seq, node.path("toolName").asText(""), asObject(node.get("input"))));
            case "toolResult" -> sendToBrowser(ctx, seq -> new ServerMessage.ToolResult(
                    seq, node.path("toolName").asText(""),
                    node.path("output").asText(""), node.path("isError").asBoolean(false)));
            case "permissionRequest" -> {
                String toolName = node.path("toolName").asText("");
                ServerMessage msg = sendToBrowser(ctx, seq -> new ServerMessage.PermissionRequest(
                        seq, node.path("reqId").asText(""), toolName, asObject(node.get("input"))));
                onDecisionPrompt(ctx, msg, "Claude 需要确认权限",
                        "工具 " + toolName + " 正在等待你授权");
            }
            case "questionRequest" -> {
                ServerMessage msg = sendToBrowser(ctx, seq -> new ServerMessage.QuestionRequest(
                        seq, node.path("reqId").asText(""), parseQuestions(node.get("questions"))));
                onDecisionPrompt(ctx, msg, "Claude 有问题等你回答", "请回到对话作答");
            }
            case "models" -> {
                ctx.models = parseModels(node.get("models"));
                ctx.currentModel = node.path("current").asText(null);
                sendToBrowser(ctx, seq -> new ServerMessage.Models(seq, ctx.models, ctx.currentModel));
            }
            case "userMessage" -> sendToBrowser(ctx,
                    seq -> new ServerMessage.UserMessage(seq, node.path("uuid").asText("")));
            case "forked" -> onForked(ctx, node);
            case "turnInfo" -> sendToBrowser(ctx, seq -> new ServerMessage.TurnInfo(
                    seq,
                    node.path("requestedModel").asText(null),
                    node.path("responseModel").asText(null),
                    node.path("viaGateway").asBoolean(false),
                    node.path("baseUrl").asText(null)));
            case "result" -> onResult(ctx, node);
            case "error" -> sendToBrowser(ctx, seq -> new ServerMessage.Error(
                    seq, node.path("code").asText("SIDECAR_ERROR"), node.path("message").asText("")));
            default -> log.debug("[claude-chat] 未知 sidecar 事件 type={}", type);
        }
    }

    private void onResult(SessionCtx ctx, JsonNode node) {
        ctx.status = SessionStatus.IDLE;
        ctx.pendingRequest = null; // 本轮结束，未决请求（含超时被拒）一并失效
        repo.touch(ctx.sessionId, SessionStatus.IDLE, System.currentTimeMillis());
        Map<String, Object> usage = asMap(node.get("usage"));
        String stopReason = node.path("stopReason").asText("end_turn");
        sendToBrowser(ctx, seq -> new ServerMessage.Result(seq, usage, stopReason));
        // 所有观察者都不在线才推送，避免打扰
        if (!hasActiveViewer(ctx)) {
            String engineLabel = "codex".equals(ctx.engine) ? "Codex" : "Claude";
            notifications.notifyDone(engineLabel + " 任务完成", shortCwd(ctx.cwd));
        }
    }

    /**
     * sidecar 分叉完成：用新 sdkSessionId 建一条会话元数据行（语义同 resumeHistory），
     * 再通知发起端切到新会话——前端 switchTo 会 resume 并按新 transcript 读历史。
     */
    private void onForked(SessionCtx ctx, JsonNode node) {
        String newSdk = node.path("sdkSessionId").asText(null);
        if (newSdk == null || newSdk.isBlank()) {
            sendToBrowser(ctx, seq -> new ServerMessage.Error(seq, "FORK_FAILED", "分叉未返回会话标识"));
            return;
        }
        String cwd = node.path("cwd").asText(ctx.cwd);
        String newId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        repo.insert(ClaudeChatSession.builder()
                .id(newId).cwd(cwd).title(null).sdkSessionId(newSdk).engine(ctx.engine)
                .status(SessionStatus.IDLE).startedAt(now).lastSeenAt(now).build());
        log.info("[claude-chat] 会话 {} 分叉出新会话 {} sdk={}", ctx.sessionId, newId, newSdk);
        sendToBrowser(ctx, seq -> new ServerMessage.Forked(seq, newId));
    }

    private void onSidecarDown() {
        sessions.values().forEach(ctx -> {
            if (ctx.status == SessionStatus.RUNNING) {
                ctx.status = SessionStatus.INTERRUPTED;
                repo.touch(ctx.sessionId, SessionStatus.INTERRUPTED, System.currentTimeMillis());
                sendToBrowser(ctx, seq -> new ServerMessage.Error(
                        seq, "SIDECAR_DOWN", "sidecar 已断开，正在自动重连…"));
            }
        });
        scheduleSidecarRecovery();
    }

    /**
     * sidecar 断开后后台自动重连并 resume 所有会话，无需用户手动重进会话。
     * 重连只针对 Java↔sidecar 链路（与浏览器网络无关），故前端的浏览器重连帮不上忙，必须由后端兜。
     */
    private void scheduleSidecarRecovery() {
        if (!recovering.compareAndSet(false, true)) return;
        Thread.ofVirtual().name("claude-chat-sidecar-recover").start(() -> {
            try {
                for (int attempt = 1; attempt <= 20; attempt++) {
                    try {
                        processRegistry.ensureStarted();
                        sidecar.ensureConnected();
                        resumeAllSessions();
                        return;
                    } catch (IOException e) {
                        if (attempt == 20) {
                            log.warn("[claude-chat] sidecar 自动重连失败，放弃（等下次用户动作再试）：{}", e.getMessage());
                            return;
                        }
                        sleep(1500);
                    }
                }
            } finally {
                recovering.set(false);
            }
        });
    }

    /** 重连成功后把所有已知 sdkSessionId 的会话在新 sidecar 上 resume，并 emit Ready 让前端清错恢复可用。 */
    private void resumeAllSessions() {
        int n = 0;
        for (SessionCtx ctx : sessions.values()) {
            if (ctx.sdkSessionId == null || ctx.sdkSessionId.isBlank()) continue;
            sidecar.resumeSession(ctx.sessionId, ctx.sdkSessionId, ctx.cwd, ctx.engine, ctx.apiBaseUrl, ctx.authToken);
            ctx.status = SessionStatus.IDLE;
            repo.touch(ctx.sessionId, SessionStatus.IDLE, System.currentTimeMillis());
            sendToBrowser(ctx, seq -> ready(ctx, seq));
            n++;
        }
        log.info("[claude-chat] sidecar 重连成功，已 resume {} 个会话", n);
    }

    /**
     * 确保 sidecar 在线且该会话已在其上 resume；断开则就地重连+resume。
     * 供 attach（浏览器重连）/ sendUserMessage（用户继续发）触发即时恢复，无需重进会话。
     */
    private boolean ensureSessionResumable(SessionCtx ctx) {
        if (sidecar.isConnected()) return true;
        try {
            processRegistry.ensureStarted();
            sidecar.ensureConnected();
        } catch (IOException e) {
            sendToBrowser(ctx, seq -> new ServerMessage.Error(
                    seq, "SIDECAR_DOWN", "sidecar 重连失败：" + e.getMessage()));
            return false;
        }
        if (ctx.sdkSessionId != null && !ctx.sdkSessionId.isBlank()) {
            sidecar.resumeSession(ctx.sessionId, ctx.sdkSessionId, ctx.cwd, ctx.engine, ctx.apiBaseUrl, ctx.authToken);
            ctx.status = SessionStatus.IDLE;
            repo.touch(ctx.sessionId, SessionStatus.IDLE, System.currentTimeMillis());
        }
        return true;
    }

    /** 空白串归一为 null，避免把空网关地址当成有效配置。 */
    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // ===== 对外查询 / 维护 =====

    public boolean isLive(String sessionId) {
        return sessions.containsKey(sessionId) && sidecar.isConnected();
    }

    public void dropSession(String id) {
        SessionCtx ctx = sessions.remove(id);
        String cwd = ctx != null ? ctx.cwd
                : repo.findById(id).map(ClaudeChatSession::getCwd).orElse(null);
        if (ctx != null) {
            sidecar.interrupt(id);
            ctx.viewers.forEach(w -> wsToSession.remove(w.getId()));
            ctx.viewers.clear();
        }
        attachments.clear(cwd, id);
    }

    // ===== 内部工具 =====

    private boolean ensureSidecar(WebSocketSession ws) {
        try {
            processRegistry.ensureStarted();
            sidecar.ensureConnected();
            return true;
        } catch (IOException e) {
            log.warn("[claude-chat] sidecar 不可用：{}", e.getMessage());
            sendError(ws, 0, "SIDECAR_DOWN", "Claude sidecar 未就绪：" + e.getMessage());
            return false;
        }
    }

    private SessionCtx ctxOf(WebSocketSession ws) {
        String sessionId = wsToSession.get(ws.getId());
        return sessionId == null ? null : sessions.get(sessionId);
    }

    /** 把 ws 绑定为某会话的观察者：先从它原会话的观察者集合摘除，再加入新会话。 */
    private void bindViewer(WebSocketSession ws, SessionCtx ctx) {
        String prev = wsToSession.get(ws.getId());
        if (prev != null && !prev.equals(ctx.sessionId)) {
            SessionCtx old = sessions.get(prev);
            if (old != null) old.viewers.remove(ws);
        }
        ctx.viewers.add(ws);
        wsToSession.put(ws.getId(), ctx.sessionId);
    }

    private boolean hasActiveViewer(SessionCtx ctx) {
        return ctx.viewers.stream().anyMatch(WebSocketSession::isOpen);
    }

    /**
     * 回放前检测空洞：客户端 lastSeq 之后、缓冲窗口最旧 seq 之前的事件已被淘汰，回放补不回来。
     * 仅在 lastSeq>0（曾收到过、属重连续看）时提示；lastSeq=0 是首次 attach（历史走 transcript），不算空洞。
     */
    private void warnIfReplayGap(SessionCtx ctx, WebSocketSession ws, long lastSeq) {
        if (lastSeq <= 0) return;
        long minBuf;
        synchronized (ctx.buffer) {
            ServerMessage first = ctx.buffer.peekFirst();
            minBuf = first == null ? 0 : first.seq();
        }
        if (minBuf > lastSeq + 1) {
            writeTo(ws, new ServerMessage.ReplayGap(0, lastSeq + 1, minBuf - 1));
            log.info("[claude-chat] 会话 {} 回放空洞：客户端 lastSeq={}，缓冲最旧={}，缺 {}~{}",
                    ctx.sessionId, lastSeq, minBuf, lastSeq + 1, minBuf - 1);
        }
    }

    /** 回放缓冲中 seq>lastSeq 的事件——只发给刚 attach 的这条连接（已在看的连接不重复收）。 */
    private void replayBuffer(SessionCtx ctx, WebSocketSession ws, long lastSeq) {
        List<ServerMessage> pending;
        synchronized (ctx.buffer) {
            pending = ctx.buffer.stream().filter(m -> m.seq() > lastSeq).toList();
        }
        for (ServerMessage m : pending) {
            writeTo(ws, m);
        }
    }

    /**
     * 记录未决的权限/提问请求；若此刻没有活跃前台连接，推送通知提醒用户回来确认，
     * 否则该请求会一直阻塞 sidecar 直到超时被拒，而用户毫不知情（弹窗根本没下发）。
     */
    private void onDecisionPrompt(SessionCtx ctx, ServerMessage msg, String title, String body) {
        ctx.pendingRequest = msg;
        if (!hasActiveViewer(ctx)) {
            notifications.notify(title, body + "（" + shortCwd(ctx.cwd) + "）");
        }
    }

    /**
     * 重连后重投仍未决的权限/提问请求，确保弹窗重新出现。
     * 仅当其 seq 未被本次 replayBuffer 覆盖（已读过）时补发，避免重复下发。
     */
    private void redeliverPending(SessionCtx ctx, WebSocketSession ws, long lastSeq) {
        ServerMessage p = ctx.pendingRequest;
        if (p != null && p.seq() <= lastSeq) {
            writeTo(ws, p);
        }
    }

    /** 打 seq + 入缓冲 + 广播给本会话所有观察者。用于所有来自 sidecar 的实时事件。 */
    private ServerMessage sendToBrowser(SessionCtx ctx, SeqMessageFactory factory) {
        ServerMessage msg = factory.build(ctx.seq.incrementAndGet());
        synchronized (ctx.buffer) {
            ctx.buffer.addLast(msg);
            while (ctx.buffer.size() > props.getEventBufferSize()) {
                ctx.buffer.pollFirst();
            }
        }
        broadcast(ctx, msg);
        return msg;
    }

    /** 广播给会话所有在看的连接，顺手清掉已关闭的。 */
    private void broadcast(SessionCtx ctx, ServerMessage msg) {
        for (WebSocketSession w : ctx.viewers) {
            if (w.isOpen()) {
                writeTo(w, msg);
            } else {
                ctx.viewers.remove(w);
            }
        }
    }

    /** 把一条消息发给指定连接（广播逐个调用 / 回放定向发给新连接）。 */
    private void writeTo(WebSocketSession ws, ServerMessage msg) {
        if (ws == null || !ws.isOpen()) return;
        try {
            synchronized (ws) {
                ws.sendMessage(new TextMessage(mapper.writeValueAsString(msg)));
            }
        } catch (IOException e) {
            log.debug("[claude-chat] 写浏览器失败：{}", e.getMessage());
        }
    }

    private void sendError(WebSocketSession ws, long seq, String code, String message) {
        try {
            String json = mapper.writeValueAsString(new ServerMessage.Error(seq, code, message));
            if (ws.isOpen()) ws.sendMessage(new TextMessage(json));
        } catch (IOException ignore) {
        }
    }

    private Object asObject(JsonNode n) {
        return n == null || n.isNull() ? null : mapper.convertValue(n, Object.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(JsonNode n) {
        return n == null || !n.isObject() ? Map.of() : mapper.convertValue(n, Map.class);
    }

    private List<String> parseStringList(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<String> out = new ArrayList<>();
        n.forEach(e -> { if (e != null && e.isTextual()) out.add(e.asText()); });
        return out;
    }

    /** 解析 init 的 mcpServers 数组（{name,status}）。 */
    private List<ServerMessage.McpServer> parseMcpServers(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ServerMessage.McpServer> out = new ArrayList<>();
        for (JsonNode e : n) {
            if (e != null && e.isObject()) {
                out.add(new ServerMessage.McpServer(
                        e.path("name").asText(""), e.path("status").asText("")));
            }
        }
        return out;
    }

    /** 解析 SDK supportedModels 数组（{value, displayName, description, …}）为前端 ModelInfo。 */
    private List<ModelInfo> parseModels(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ModelInfo> out = new ArrayList<>();
        for (JsonNode e : n) {
            String value = e.path("value").asText(null);
            if (value == null || value.isBlank()) continue;
            out.add(new ModelInfo(value, e.path("displayName").asText(value), e.path("description").asText("")));
        }
        return out;
    }

    private List<ClientMessage.Question> parseQuestions(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        try {
            return mapper.convertValue(n, mapper.getTypeFactory()
                    .constructCollectionType(List.class, ClientMessage.Question.class));
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String shortCwd(String cwd) {
        if (cwd == null) return "";
        int i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'));
        return i >= 0 && i < cwd.length() - 1 ? cwd.substring(i + 1) : cwd;
    }

    @FunctionalInterface
    private interface SeqMessageFactory {
        ServerMessage build(long seq);
    }

    /** 单会话运行时状态。 */
    private static final class SessionCtx {
        final String sessionId;
        final String cwd;
        final AtomicLong seq = new AtomicLong(0);
        /** 本内存会话实例的纪元标识。每次新建 ctx（含后端重启、内存淘汰后重建）都不同，
         *  随 Ready 透传给前端，使其在服务端 seq 复位时同步重置去重高水位。 */
        final String epoch = UUID.randomUUID().toString();
        final Deque<ServerMessage> buffer = new ArrayDeque<>();
        volatile String sdkSessionId;
        /** 会话引擎 claude/codex；start/resume 透传给 sidecar，决定走哪条 agentic loop。 */
        volatile String engine = "claude";
        /** 各引擎各自的 SDK 会话句柄（engine -> sdkSessionId）；切回某引擎时 resume 其原生会话，持久化到 DB engine_sessions(JSON)。 */
        final Map<String, String> engineSessions = new ConcurrentHashMap<>();
        volatile SessionStatus status = SessionStatus.IDLE;
        /** 第三方网关 baseURL/token（仅 Claude 会话）；start/resume 透传给 sidecar，使重连/重启后仍指向同一网关。空=官方。 */
        volatile String apiBaseUrl;
        volatile String authToken;
        /** 当前在看本会话的所有浏览器连接（多端同看）。广播事件遍历此集合，断开按连接移除。 */
        final Set<WebSocketSession> viewers = ConcurrentHashMap.newKeySet();
        /** 会话权限模式，默认 default；切换后随下一轮 send 透传给 sidecar。 */
        volatile String mode = "default";
        /** 福利签收演示会话：true 时走一次性副本沙箱，断连即销毁，不持久化、不进正式列表。 */
        volatile boolean demo = false;
        /**
         * 当前未决的权限/提问请求。sidecar 的 canUseTool 会阻塞整轮等决策，故同一时刻至多一个。
         * 断线重连时据此重投，避免弹窗因事件缓冲淘汰或 seq 已读而丢失；决策到达或本轮结束时清空。
         */
        volatile ServerMessage pendingRequest;
        /** 该会话可用的 slash 命令清单（来自 SDK init），随每条 Ready 透传给前端做补全。 */
        volatile java.util.List<String> slashCommands = java.util.List.of();
        /** 该会话激活的能力（来自 SDK init），随 Ready 透传给前端展示。 */
        volatile java.util.List<String> skills = java.util.List.of();
        volatile java.util.List<String> agents = java.util.List.of();
        volatile java.util.List<ServerMessage.McpServer> mcpServers = java.util.List.of();
        volatile String outputStyle = null;
        /** 该会话可用模型清单（来自 SDK supportedModels）与当前模型，供命令菜单的模型组展示/切换。 */
        volatile java.util.List<ModelInfo> models = java.util.List.of();
        volatile String currentModel;

        SessionCtx(String sessionId, String cwd) {
            this.sessionId = sessionId;
            this.cwd = cwd;
        }
    }
}
