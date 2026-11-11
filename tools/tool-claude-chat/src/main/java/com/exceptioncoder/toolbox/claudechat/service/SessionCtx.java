package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import org.springframework.web.socket.WebSocketSession;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** 单会话运行时状态（从 ClaudeChatService 拆出的内部状态容器，包内可见）。 */
final class SessionCtx {
    final String sessionId;
    final String cwd;
    final AtomicLong seq = new AtomicLong(0);
    /** 本内存会话实例的纪元标识。每次新建 ctx（含后端重启、内存淘汰后重建）都不同，
     *  随 Ready 透传给前端，使其在服务端 seq 复位时同步重置去重高水位。 */
    final String epoch = UUID.randomUUID().toString();
    final Deque<ServerMessage> buffer = new ArrayDeque<>();
    volatile String sdkSessionId;
    volatile String codexPredictionSourceTurnId;
    /** 会话引擎 claude/codex；start/resume 透传给 sidecar，决定走哪条 agentic loop。 */
    volatile String engine = "claude";
    /** 各引擎各自的 SDK 会话句柄（engine -> sdkSessionId）；切回某引擎时 resume 其原生会话，持久化到 DB engine_sessions(JSON)。 */
    final Map<String, String> engineSessions = new ConcurrentHashMap<>();
    volatile SessionStatus status = SessionStatus.IDLE;
    /** 第三方网关 baseURL/token（仅 Claude 会话）；start/resume 透传给 sidecar，使重连/重启后仍指向同一网关。空=官方。 */
    volatile String apiBaseUrl;
    volatile String authToken;
    /** Codex 官方登录配置根目录；空值使用默认 ~/.codex。 */
    volatile String codexHome;
    /** 当前在看本会话的所有浏览器连接（多端同看）。广播事件遍历此集合，断开按连接移除。 */
    final Set<WebSocketSession> viewers = ConcurrentHashMap.newKeySet();
    /** 会话权限模式，默认 default；切换后随下一轮 send 透传给 sidecar。 */
    volatile String mode = "default";
    /** 服务端执行能力边界；咨询只读策略优先于 mode，且会随持久化恢复。 */
    volatile String executionPolicy = SessionExecutionPolicy.STANDARD;
    volatile List<String> consultEvidenceSystems = List.of();
    volatile ConsultRuntimeCoordinator.Plan consultAccountPlan;
    volatile boolean consultNativeReady;
    volatile boolean consultAccountCommitted = true;
    volatile int consultAssistantBlock;
    /**
     * 「弹窗自动允许」兜底开关。服务端持有是关键：它以前是纯前端 useEffect 自动点「允许」，
     * 用户切走页面（组件卸载/浏览器后台节流）就失效，请求挂到超时 deny 或撞上中断变成
     * stream closed。放到这里后随每次 resume 一并回灌 sidecar，与浏览器在不在线无关。
     */
    volatile boolean autoApprove = false;
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
    volatile java.util.List<ServerMessage.SkillCapability> skillDetails = java.util.List.of();
    volatile java.util.List<ServerMessage.PluginCapability> plugins = java.util.List.of();
    volatile java.util.List<String> agents = java.util.List.of();
    volatile java.util.List<ServerMessage.McpServer> mcpServers = java.util.List.of();
    volatile String outputStyle = null;
    volatile String capabilitySource = "unknown";
    volatile long capabilityRefreshedAt = System.currentTimeMillis();
    volatile java.util.List<String> capabilityErrors = java.util.List.of();
    /** 该会话可用模型清单（来自 SDK supportedModels）与当前模型，供命令菜单的模型组展示/切换。 */
    volatile java.util.List<ModelInfo> models = java.util.List.of();
    volatile String currentModel;
    volatile ServerMessage.ActiveModelConfiguration activeModelConfiguration;
    volatile String codexReasoningEffort = "low";
    volatile String codexSpeed = "default";
    /** 该会话当前存活的后台任务快照（来自 sidecar 的 backgroundTasks 事件），随每条 Ready 透传给
     *  前端——切会话/重连那一刻就能查到是否还有后台任务在跑，不用等下一次变化事件推送。 */
    volatile java.util.List<ServerMessage.BackgroundTaskInfo> backgroundTasks = java.util.List.of();
    /** 最近一次成功终态尚未释放队首；消费后立即复位，确保每轮最多自动发送一条。 */
    volatile boolean queueReleaseReady;
    volatile String interruptedDispatchTurnId;
    volatile String queueReceiptStoreId;
    volatile boolean queueResumeRequested;
    volatile boolean sidecarSessionPresent = true;
    volatile String lastTurnErrorCode;
    volatile String lastTurnErrorMessage;
    final Set<String> acceptedMessageIds = new LinkedHashSet<>();

    SessionCtx(String sessionId, String cwd) {
        this.sessionId = sessionId;
        this.cwd = cwd;
    }
}
