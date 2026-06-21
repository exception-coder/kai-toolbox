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


def _ensure_agentscope() -> bool:
    global _as_ready, _as_error
    if _as_ready:
        return True
    with _as_lock:
        if _as_ready:
            return True
        try:
            import agentscope
            kwargs: dict = {}
            if AS_STUDIO_URL:
                kwargs["studio_url"] = AS_STUDIO_URL
                log.info("[agentscope] 连接 Studio: %s", AS_STUDIO_URL)
            agentscope.init(**kwargs)
            _as_ready = True
            log.info("[agentscope] 初始化成功")
            return True
        except ImportError:
            _as_error = "agentscope 未安装"
            log.warning("[agentscope] %s", _as_error)
            return False
        except Exception as exc:
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

SYSTEM_PROMPT = """你是企业前台访客身份判别助手。只依据给定信息判断访客身份，信息不足时果断选 UNKNOWN，不要编造。
身份(identity)只能从以下取值：CUSTOMER(客户) / COMPETITOR(竞争对手) / VENDOR(供应商) / PARTNER(合作伙伴) / JOB_SEEKER(求职者) / OFFICIAL(政府监管媒体) / UNKNOWN(无法识别)。
关系(relationship)仅当 identity=CUSTOMER 时有意义，取值：NEW(新客) / EXISTING(熟客) / CHURNED(流失)；其余情况一律 NONE。
注意：是否为已成交老客户由系统的客户库决定，不在你的判断范围；你只在"客户库未命中的灰区"里判断访客最可能的身份。
只输出 JSON，字段：identity, relationship, confidence(0~1 浮点), rationale(中文一句话理由), evidence(字符串数组，列出你依据的具体线索)。"""


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

    text = "访客信息如下，请判别：\n" + json.dumps(fields, ensure_ascii=False, indent=2)

    # 向量召回上下文：告知 LLM 历史相似案例，辅助判断
    if similar_records:
        text += "\n\n【向量语义召回：最相似的历史记录，仅供参考，请结合当前访客信息综合判断】\n"
        for i, rec in enumerate(similar_records, 1):
            company  = rec.get("company") or rec.get("company_norm", "未知公司")
            identity = rec.get("identity", "")
            rel      = rec.get("relationship", "")
            score    = rec.get("score", 0)
            source   = "客户库" if rec.get("source") == "customer" else "历史访客"
            conf     = rec.get("confidence", "")
            label    = f"{identity}/{rel}" if rel and rel != "NONE" else identity
            conf_str = f"，原判置信度 {conf:.0%}" if conf else ""
            text += f"  {i}. [{label}] {company}（相似度 {score:.0%}，来源：{source}{conf_str}）\n"

    return text


# ── LLM 调用 ──────────────────────────────────────────────────────────────────

def _classify_with_agentscope(payload: dict, enrichment: dict,
                               base_url: str, api_key: str, model_name: str,
                               similar_records: list[dict]) -> dict:
    if not _ensure_agentscope():
        raise NotImplementedError("agentscope not available")

    from agentscope.models import OpenAIChatWrapper
    config_name = f"va-{abs(hash(base_url + model_name)):08x}"
    generate_args: dict = {"response_format": {"type": "json_object"}}
    ml = model_name.lower()
    if not any(p in ml for p in ("gpt-5", "o1", "o3", "o4", "reasoner", "thinking", "qwq")):
        generate_args["temperature"] = 0.2

    model = OpenAIChatWrapper(
        config_name=config_name,
        model_name=model_name,
        api_key=api_key,
        client_args={"base_url": base_url},
        generate_args=generate_args,
    )
    from agentscope.message import Msg
    messages = [
        Msg(name="system", content=SYSTEM_PROMPT, role="system"),
        Msg(name="user",   content=_build_user_prompt(payload, enrichment, similar_records), role="user"),
    ]
    response = model(messages)
    text = getattr(response, "text", None) or str(response)
    data = json.loads(text)
    data["model"] = model_name
    log.info("[agentscope] identity=%s confidence=%s similar=%d",
             data.get("identity"), data.get("confidence"), len(similar_records))
    return data


def _classify_openai_compatible(payload: dict, enrichment: dict,
                                 base_url: str, api_key: str, model: str,
                                 similar_records: list[dict]) -> dict:
    from openai import OpenAI
    client = OpenAI(base_url=base_url, api_key=api_key)
    kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": _build_user_prompt(payload, enrichment, similar_records)},
        ],
        "response_format": {"type": "json_object"},
    }
    ml = model.lower()
    if not any(p in ml for p in ("gpt-5", "o1", "o3", "o4", "reasoner", "thinking", "qwq")):
        kwargs["temperature"] = 0.2
    resp = client.chat.completions.create(**kwargs)
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    data["model"] = model
    log.info("[openai-compat] identity=%s confidence=%s similar=%d",
             data.get("identity"), data.get("confidence"), len(similar_records))
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

    # ── ③ LLM 分类（AgentScope 主路 → OpenAI SDK 保底）─────────────────────────
    try:
        data = _classify_with_agentscope(payload, enrichment, base_url, api_key, model_name, similar_records)
    except Exception as exc:
        if not isinstance(exc, NotImplementedError):
            log.warning("[agentscope] 回退 OpenAI SDK: %s", exc)
        data = _classify_openai_compatible(payload, enrichment, base_url, api_key, model_name, similar_records)

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

    return {
        "identity":     identity,
        "relationship": relationship,
        "confidence":   confidence,
        "rationale":    data.get("rationale", ""),
        "evidence":     data.get("evidence", []),
        "model":        data.get("model", model_name),
        "degraded":     degraded,
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


@app.post("/index/visitor")
async def index_visitor(request: Request):
    """Java 端在访客判别完成后调用，把判别结果作为历史案例索引到 Qdrant。"""
    data = await request.json()
    identity     = data.pop("identity", "UNKNOWN")
    relationship = data.pop("relationship", "NONE")
    confidence   = float(data.pop("confidence", 0.0))
    ok = vector_service.index_visitor(data, identity, relationship, confidence)
    return JSONResponse({"indexed": ok})
