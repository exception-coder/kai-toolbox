"""访客分析 AgentScope sidecar

职责边界（与 Java 侧约定）：
- Java 已完成"确定性匹配"（客户库 / 竞品名单 / 别名命中即定），命中的访客**不会**调到这里。
- 本服务只接 Java 判不了的"灰区"访客，依次做三件事：
    ① enrich_company：企业数据增强（当前为模拟桩，自动降级）
    ② vector_search：向量召回历史相似记录（bge-m3 + Qdrant），作为 LLM 上下文
    ③ classify：字段 + 增强数据 + 相似历史 → LLM 结构化分类提议
- 输出一律是"提议"，由 Java 端代码裁决（枚举校验 + 置信度阈值）后才落库。

向量召回层（新增）：
  用 Ollama bge-m3 把公司名+地址+来访目的做 embedding，搜 Qdrant 历史相似记录，
  作为 LLM 的参考上下文——让 LLM 看到"这家公司最像历史上的某客户/访客"再判断。
  Qdrant 不可用 → 跳过召回直接 LLM，主流程不受影响。

AgentScope 集成：
  _classify_with_agentscope 用 AgentScope OpenAIChatWrapper 接管 LLM 调用，
  Studio 自动收 OTel trace（配置 AS_STUDIO_URL 开启）。
  agentscope 不可用时回退 _classify_openai_compatible。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import threading

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import vector_service  # 向量检索服务（Qdrant + bge-m3）

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s")
log = logging.getLogger("visitor-analysis-sidecar")

# ── 模型配置 ──────────────────────────────────────────────────────────────────
LLM_BASE_URL  = os.getenv("VA_LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_API_KEY   = os.getenv("VA_LLM_API_KEY", "")
LLM_MODEL     = os.getenv("VA_LLM_MODEL", "deepseek-chat")
AS_STUDIO_URL = os.getenv("AS_STUDIO_URL", "")

IDENTITIES    = ["CUSTOMER", "COMPETITOR", "VENDOR", "PARTNER", "JOB_SEEKER", "OFFICIAL", "UNKNOWN"]
RELATIONSHIPS = ["NEW", "EXISTING", "CHURNED", "NONE"]

app = FastAPI(title="kai-toolbox visitor-analysis sidecar")

# ── AgentScope 惰性初始化 ─────────────────────────────────────────────────────
_as_lock  = threading.Lock()
_as_ready = False
_as_error = ""


_studio_traced = False


def _setup_studio_tracing() -> None:
    """把 AgentScope 2.x 的 OpenTelemetry span 推到 Studio（{AS_STUDIO_URL}/v1/traces，与 Java 侧同口径）。
    仅在配了 AS_STUDIO_URL 时启用；失败只 warn，绝不影响模型调用（§6：可观测但不阻断主流程）。
    """
    global _studio_traced
    if _studio_traced or not AS_STUDIO_URL:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        endpoint = AS_STUDIO_URL.rstrip("/") + "/v1/traces"
        provider = TracerProvider(resource=Resource.create({"service.name": "visitor-analysis-sidecar"}))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
        trace.set_tracer_provider(provider)
        _studio_traced = True
        log.info("[agentscope] Studio tracing → %s", endpoint)
    except Exception as exc:  # noqa: BLE001
        log.warning("[agentscope] Studio tracing 配置失败（忽略，不影响判别）: %s", exc)


def _ensure_agentscope() -> bool:
    """AgentScope 2.x：不再有 agentscope.init()，能导入 OpenAIChatModel 即可用。
    顺带尽力挂上 Studio tracing（best-effort）。失败置 _as_error 并返回 False，由调用方回退 openai SDK。
    """
    global _as_ready, _as_error
    if _as_ready:
        return True
    with _as_lock:
        if _as_ready:
            return True
        try:
            from agentscope.model import OpenAIChatModel  # noqa: F401  仅探测可用性
            _setup_studio_tracing()
            _as_ready = True
            log.info("[agentscope] 就绪 (2.x OpenAIChatModel)%s",
                     f"，Studio={AS_STUDIO_URL}" if AS_STUDIO_URL else "")
            return True
        except ImportError as exc:
            _as_error = f"agentscope 不可用: {exc}"
            log.warning("[agentscope] %s", _as_error)
            return False
        except Exception as exc:  # noqa: BLE001
            _as_error = str(exc)
            log.warning("[agentscope] 初始化失败: %s", exc)
            return False


# ── /health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {
        "status":    "ok",
        "model":     LLM_MODEL,
        "llm_ready": bool(LLM_API_KEY),
        "agentscope": {"ready": _as_ready, "studio_url": AS_STUDIO_URL or None, "error": _as_error or None},
        "vector":     vector_service.status(),
    }


# ── 企业数据增强（桩）─────────────────────────────────────────────────────────

def enrich_company(company: str) -> dict:
    if not company:
        return {"degraded": True, "industry": None, "biz_scope": None, "note": "无公司名"}
    return {"degraded": True, "industry": None, "biz_scope": None,
            "note": "企业数据增强为模拟桩，未接入真实工商数据"}


# ── System Prompt & 提示词构建 ────────────────────────────────────────────────

SYSTEM_PROMPT = """你是「客户新增申请去重」判别助手。给你一条客户新增申请，以及从历史客户资料库召回的最相似已有客户记录。
判断这条申请与库中已有客户是否为同一家：是 → 【重复客户】，否 → 【新客】。

判定规则（业务口径，严格执行，不要自行放宽）：
1. 公司名称与某条召回记录【完全一致】（去掉公司/有限公司等后缀后逐字相同）→ 重复客户。
2. 公司名称不完全一致时：名字只是「相似 / 像 / 关键字相同」一律【不作为判定依据】——不要因为名字看着像就判重复。
   这种情况【只看地址】：与某条召回记录【地址高度相似】（同一地址，或门牌级地址极其接近）→ 重复客户。
3. 公司名称非完全一致，且地址也不高度相似 → 新客。
4. 信息不足以确认时判新客并降低置信度，不要臆断。

注意：名字相似但地址不相似 = 新客；名字不同但地址高度相似 = 重复客户。地址是非完全同名时的唯一判据。

只输出 JSON，字段：
  identity      固定为 "CUSTOMER"
  relationship  EXISTING(重复客户) / NEW(新客)
  confidence    0~1 浮点（对"是否同一家"判断的把握）
  rationale     中文一句话；判重复必须指明依据是「公司名称完全一致」还是「地址高度相似」，并指出对应的召回记录
  evidence      字符串数组（公司名 / 地址 / 召回相似度等具体线索）"""


def _build_user_prompt(payload: dict, enrichment: dict,
                       similar_records: list[dict] | None = None) -> str:
    """构建 LLM 用户提示，包含访客字段 + 企业增强数据 + 向量召回的历史相似记录。"""
    fields: dict = {
        "姓名":               payload.get("name"),
        "手机号":              payload.get("phone"),
        "公司":               payload.get("company"),
        "公司地址（原始）":    payload.get("company_addr"),
        "邮箱":               payload.get("email"),
        "来访目的":            payload.get("purpose"),
        "该访客历史来访次数":  payload.get("visit_count"),
        "企业增强数据":        enrichment,
    }
    if payload.get("addr_norm"):
        fields["地址归一化（城市+区）"] = payload["addr_norm"]
    if payload.get("addr_hint"):
        fields["地址参考提示（客户库同城区公司）"] = payload["addr_hint"]

    text = "客户新增申请信息如下，请判断是否与库中已有客户重复：\n" + json.dumps(fields, ensure_ascii=False, indent=2)

    # 历史客户资料库召回上下文：判断本申请是否与某条已有客户为同一家（重复客户）。
    # 必须带出候选地址——非完全同名时「地址高度相似」是唯一判据，LLM 需要候选地址才能比对。
    if similar_records:
        text += "\n\n【历史客户资料库召回：与本申请最相似的已有客户记录，按相似度排序。判重复请优先比对公司名是否完全一致、其次比对地址是否高度相似】\n"
        for i, rec in enumerate(similar_records, 1):
            company = rec.get("company") or rec.get("company_norm", "未知公司")
            cand_addr = rec.get("company_addr") or rec.get("addr_norm") or "地址缺失"
            score   = rec.get("score", 0)
            source  = "客户库" if rec.get("source") == "customer" else "历史访客"
            text += f"  {i}. 公司名：{company}｜地址：{cand_addr}（文本相似度 {score:.0%}，来源：{source}）\n"

    return text


# ── LLM 调用 ──────────────────────────────────────────────────────────────────

# 推理类模型不接受 temperature 参数。单一来源（§4），agentscope / openai-compat 两条路径共用。
_REASONING_HINTS = ("gpt-5", "o1", "o3", "o4", "reasoner", "thinking", "qwq")


def _is_reasoning_model(model_name: str) -> bool:
    ml = (model_name or "").lower()
    return any(p in ml for p in _REASONING_HINTS)


_bg_loop = None
_bg_loop_lock = threading.Lock()


def _get_bg_loop() -> "asyncio.AbstractEventLoop":
    """常驻后台事件循环（守护线程）。所有 AgentScope async 调用都提交到这同一个 loop。
    早先用 asyncio.run 每次新建+关闭 loop：模型底层 openai AsyncClient 的异步清理被排到
    已关闭的 loop 上 → 刷 'Event loop is closed'。常驻 loop 不关闭，异步资源能正常回收。
    """
    global _bg_loop
    if _bg_loop is not None:
        return _bg_loop
    with _bg_loop_lock:
        if _bg_loop is None:
            loop = asyncio.new_event_loop()
            threading.Thread(target=loop.run_forever, name="va-agent-loop", daemon=True).start()
            _bg_loop = loop
    return _bg_loop


def _run_coro(coro):
    """在同步上下文（含 /analyze 这种已有运行中 loop 的 async 端点）里跑 AgentScope async 调用：
    提交到常驻后台 loop 并阻塞等结果，避免直接 asyncio.run 撞 'running event loop' 或关闭 loop。
    """
    fut = asyncio.run_coroutine_threadsafe(coro, _get_bg_loop())
    return fut.result()


def _loads_json_lenient(text: str) -> dict:
    """容忍模型把 JSON 包在 ```json ... ``` 代码块里：剥掉栅栏再解析。
    走 Agent 路径时不能强制 response_format=json_object，故对输出做兜底解析（§2）。
    """
    s = (text or "").strip()
    if s.startswith("```"):
        s = s[3:]
        nl = s.find("\n")
        if nl != -1 and s[:nl].strip().lower() in ("json", ""):
            s = s[nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()
    return json.loads(s or "{}")


def _classify_with_agentscope(user_prompt: str, base_url: str, api_key: str,
                               model_name: str, similar_count: int) -> dict:
    if not _ensure_agentscope():
        raise NotImplementedError("agentscope not available")

    from agentscope.agent import Agent, ReActConfig
    from agentscope.model import OpenAIChatModel
    from agentscope.credential import OpenAICredential
    from agentscope.message import UserMsg
    from agentscope.middleware import TracingMiddleware

    # 非推理模型才设 temperature（单一来源 _is_reasoning_model，§4）；Agent 内部代管模型调用，
    # 故温度走模型 Parameters 而非 per-call kwargs。
    params = OpenAIChatModel.Parameters()
    if not _is_reasoning_model(model_name):
        params.temperature = 0.2

    model = OpenAIChatModel(
        credential=OpenAICredential(api_key=api_key, base_url=base_url),
        model=model_name,
        parameters=params,
        stream=False,
    )
    # 无 toolkit：模型不产生 tool_call，reasoning 一步即出最终回复并退出循环；
    # max_iters 仅作异常下的兜底上限（§6）。挂 TracingMiddleware：配了 AS_STUDIO_URL 时
    # 由 _setup_studio_tracing 建的 OTel Provider 把 reply / model-call span 推到 Studio；
    # 没配则 _check_tracing_enabled 为假、middleware 透传不产生开销。
    agent = Agent(
        name="visitor-classifier",
        system_prompt=SYSTEM_PROMPT,
        model=model,
        middlewares=[TracingMiddleware()],
        react_config=ReActConfig(max_iters=3),
    )
    user = UserMsg(name="user", content=user_prompt)
    # 2.x agent.reply 是 async；在独立线程新 loop 跑，兼容 async 端点的运行中 loop（见 _run_coro）。
    final = _run_coro(agent.reply(user))
    raw = final.get_text_content() or "{}"
    log.info("[agentscope] LLM 原始返回:\n%s", raw)
    # LLM 输出当不可信入参：仅解析，枚举校验+兜底统一在 classify()（§2）。
    data = _loads_json_lenient(raw)
    data["model"] = model_name
    log.info("[agentscope] identity=%s confidence=%s similar=%d",
             data.get("identity"), data.get("confidence"), similar_count)
    return data


def _classify_openai_compatible(user_prompt: str, base_url: str, api_key: str,
                                 model: str, similar_count: int) -> dict:
    from openai import OpenAI
    client = OpenAI(base_url=base_url, api_key=api_key)
    kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    if not _is_reasoning_model(model):
        kwargs["temperature"] = 0.2
    resp = client.chat.completions.create(**kwargs)
    content = resp.choices[0].message.content or "{}"
    log.info("[openai-compat] LLM 原始返回:\n%s", content)
    data = json.loads(content)
    data["model"] = model
    log.info("[openai-compat] identity=%s confidence=%s similar=%d",
             data.get("identity"), data.get("confidence"), similar_count)
    return data


# ── 分类主流程 ────────────────────────────────────────────────────────────────

def classify(payload: dict) -> dict:
    company = payload.get("company") or ""
    enrichment = enrich_company(company)
    degraded = bool(enrichment.get("degraded"))

    llm = payload.get("llm") or {}
    base_url   = (llm.get("base_url")  or LLM_BASE_URL or "").strip()
    api_key    = (llm.get("api_key")   or LLM_API_KEY  or "").strip()
    model_name = (llm.get("model")     or LLM_MODEL    or "").strip()

    if not api_key:
        return {
            "identity": "UNKNOWN", "relationship": "NONE", "confidence": 0.0,
            "rationale": "未配置 LLM key，无法判别灰区",
            "evidence": ["LLM api_key 缺失"], "model": model_name, "degraded": True,
        }

    # ── ② 向量召回：embed 当前访客 → 搜历史相似记录作为 LLM 上下文 ────────────
    similar_records = vector_service.search_similar(payload)

    # 组装送给 LLM 的完整上下文（system + user），两条路径共用同一份（§4 单一来源）。
    user_prompt = _build_user_prompt(payload, enrichment, similar_records)
    similar_count = len(similar_records)
    log.info("[llm-context] model=%s 召回相似记录=%d 条\n"
             "================= SYSTEM PROMPT =================\n%s\n"
             "================= USER PROMPT ===================\n%s\n"
             "================================================",
             model_name, similar_count, SYSTEM_PROMPT, user_prompt)

    # ── ③ LLM 分类（AgentScope 主路 → OpenAI SDK 保底）─────────────────────────
    try:
        data = _classify_with_agentscope(user_prompt, base_url, api_key, model_name, similar_count)
    except Exception as exc:
        if not isinstance(exc, NotImplementedError):
            log.warning("[agentscope] 回退 OpenAI SDK: %s", exc)
        data = _classify_openai_compatible(user_prompt, base_url, api_key, model_name, similar_count)

    # ── 代码裁决（归一化兜底，最终裁决仍在 Java 端）───────────────────────────
    identity = (data.get("identity") or "UNKNOWN").upper()
    if identity not in IDENTITIES:
        identity = "UNKNOWN"
    relationship = (data.get("relationship") or "NONE").upper()
    if relationship not in RELATIONSHIPS:
        relationship = "NONE"
    try:
        confidence = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    # 向量召回记录随结果回传，供前端在判别结果处展示「相似度可信度」。
    similar_out = [
        {
            "company":      r.get("company") or r.get("company_norm", ""),
            "identity":     r.get("identity", ""),
            "relationship": r.get("relationship", ""),
            "score":        r.get("score", 0.0),
            "source":       r.get("source", ""),
            "confidence":   r.get("confidence"),
        }
        for r in similar_records
    ]

    return {
        "identity":     identity,
        "relationship": relationship,
        "confidence":   confidence,
        "rationale":    data.get("rationale", ""),
        "evidence":     data.get("evidence", []),
        "model":        data.get("model", model_name),
        "degraded":     degraded,
        "similar":      similar_out,
    }


# ── HTTP 路由 ─────────────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze(request: Request):
    payload = await request.json()
    log.info("analyze company=%s addr_norm=%s", payload.get("company"), payload.get("addr_norm"))
    try:
        return JSONResponse(classify(payload))
    except Exception as e:  # noqa: BLE001
        log.exception("classify failed")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/index/customer")
async def index_customer(request: Request):
    """Java 端在客户入库后调用，把客户记录索引到 Qdrant 供向量召回。"""
    data = await request.json()
    ok = vector_service.index_customer(data)
    return JSONResponse({"indexed": ok})


@app.post("/index/customers/clear")
def clear_customers():
    """清空向量库客户集合 va_customers（供「先清空再重新同步」）。"""
    return JSONResponse(vector_service.clear_customers())


@app.post("/index/visitor")
async def index_visitor(request: Request):
    """Java 端在访客判别完成后调用，把判别结果作为历史案例索引到 Qdrant。"""
    data = await request.json()
    identity     = data.pop("identity", "UNKNOWN")
    relationship = data.pop("relationship", "NONE")
    confidence   = float(data.pop("confidence", 0.0))
    ok = vector_service.index_visitor(data, identity, relationship, confidence)
    return JSONResponse({"indexed": ok})
