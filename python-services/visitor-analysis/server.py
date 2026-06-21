"""访客分析 AgentScope sidecar

职责边界（与 Java 侧约定）：
- Java 已完成"确定性匹配"（客户库 / 竞品名单 / 别名命中即定），命中的访客**不会**调到这里。
- 本服务只接 Java 判不了的"灰区"访客，做两件模糊事：
    ① enrich_company：企业数据增强（当前为模拟桩，自动降级）
    ② classify：把字段 + 增强数据交给 LLM，产出结构化分类提议
- 输出一律是"提议"，由 Java 端代码裁决（枚举校验 + 置信度阈值）后才落库。

AgentScope 集成：
  _classify_with_agentscope 用 AgentScope 的 OpenAIChatWrapper 发 LLM 调用——
  AgentScope 接管后 token / cost / latency 自动打 OTel span，发到 Studio（:3000）可视化。
  _classify_openai_compatible 作保底兜底：agentscope 未安装或调用失败时自动切换。

为什么只用一次结构化输出，不走 ReAct 工具循环：
  确定性步骤（归一化/查库/增强）全在 Java / 本文件按固定顺序完成，
  模型只做最后那步"给我一个枚举 + 理由"——结构稳、延迟低、贴 deterministic-first。

启动见同目录 start.bat / README.md。
"""
from __future__ import annotations

import json
import logging
import os
import threading

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s")
log = logging.getLogger("visitor-analysis-sidecar")

# ── 模型配置：第三方 OpenAI 兼容平台，key 走环境变量，绝不写进仓库 ────────────
LLM_BASE_URL = os.getenv("VA_LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_API_KEY  = os.getenv("VA_LLM_API_KEY", "")
LLM_MODEL    = os.getenv("VA_LLM_MODEL", "deepseek-chat")

# ── AgentScope Studio 地址（空 = 不接 Studio，仅打本地日志）────────────────────
AS_STUDIO_URL = os.getenv("AS_STUDIO_URL", "")   # 如 http://localhost:3000

# 候选类别（与 Java 枚举 IdentityType / RelationshipType 保持一致）
IDENTITIES    = ["CUSTOMER", "COMPETITOR", "VENDOR", "PARTNER", "JOB_SEEKER", "OFFICIAL", "UNKNOWN"]
RELATIONSHIPS = ["NEW", "EXISTING", "CHURNED", "NONE"]

app = FastAPI(title="kai-toolbox visitor-analysis sidecar")

# ── AgentScope 惰性初始化 ─────────────────────────────────────────────────────
_as_lock  = threading.Lock()
_as_ready = False   # True = agentscope.init() 已成功
_as_error = ""      # 失败原因，供 /health 展示


def _ensure_agentscope() -> bool:
    """惰性初始化 AgentScope（仅 Studio 连接，不预注册模型——凭证随请求传入）。
    线程安全，只跑一次。"""
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
            _as_error = "agentscope 未安装（pip install agentscope）"
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
        "status": "ok",
        "model": LLM_MODEL,
        "base_url": LLM_BASE_URL,
        "llm_ready": bool(LLM_API_KEY),
        "agentscope": {
            "ready": _as_ready,
            "studio_url": AS_STUDIO_URL or None,
            "error": _as_error or None,
        },
    }


# ── 企业数据增强（桩）─────────────────────────────────────────────────────────

def enrich_company(company: str) -> dict:
    """企业数据增强（模拟桩）。真实接入时换成企查查/天眼查适配器，签名不变。
    返回 degraded=True 表示未拿到真实数据，分类时据此降低置信度并标注。
    """
    if not company:
        return {"degraded": True, "industry": None, "biz_scope": None, "note": "无公司名"}
    return {"degraded": True, "industry": None, "biz_scope": None,
            "note": "企业数据增强为模拟桩，未接入真实工商数据"}


# ── System Prompt & 用户提示词构建 ────────────────────────────────────────────

SYSTEM_PROMPT = """你是企业前台访客身份判别助手。只依据给定信息判断访客身份，信息不足时果断选 UNKNOWN，不要编造。
身份(identity)只能从以下取值：CUSTOMER(客户) / COMPETITOR(竞争对手) / VENDOR(供应商) / PARTNER(合作伙伴) / JOB_SEEKER(求职者) / OFFICIAL(政府监管媒体) / UNKNOWN(无法识别)。
关系(relationship)仅当 identity=CUSTOMER 时有意义，取值：NEW(新客) / EXISTING(熟客) / CHURNED(流失)；其余情况一律 NONE。
注意：是否为已成交老客户由系统的客户库决定，不在你的判断范围；你只在"客户库未命中的灰区"里判断访客最可能的身份。
只输出 JSON，字段：identity, relationship, confidence(0~1 浮点), rationale(中文一句话理由), evidence(字符串数组，列出你依据的具体线索)。"""


def _build_user_prompt(payload: dict, enrichment: dict) -> str:
    fields: dict = {
        "姓名": payload.get("name"),
        "手机号": payload.get("phone"),
        "公司": payload.get("company"),
        "公司地址（原始）": payload.get("company_addr"),
        "邮箱": payload.get("email"),
        "来访目的": payload.get("purpose"),
        "该访客历史来访次数": payload.get("visit_count"),
        "企业增强数据": enrichment,
    }
    # addr_norm / addr_hint 由 Java 在有地址软匹配时追加，辅助判别
    if payload.get("addr_norm"):
        fields["地址归一化（城市+区）"] = payload["addr_norm"]
    if payload.get("addr_hint"):
        fields["地址参考提示（客户库同城区公司）"] = payload["addr_hint"]
    return "访客信息如下，请判别：\n" + json.dumps(fields, ensure_ascii=False, indent=2)


# ── LLM 调用：AgentScope 路径（主）+ OpenAI SDK 路径（保底）─────────────────

def _classify_with_agentscope(payload: dict, enrichment: dict,
                               base_url: str, api_key: str, model_name: str) -> dict:
    """
    通过 AgentScope 模型层发起 LLM 调用。
    AgentScope 接管后的额外收益（无需改业务代码）：
      - token / cost / latency 自动打 OTel span
      - 若配置了 AS_STUDIO_URL，trace 实时推送到 AgentScope Studio 可视化
      - 未来可一行切换到 DashScopeModel / AnthropicModel 等，不改分类逻辑

    凭证（base_url / api_key / model_name）由调用方每次传入，
    不依赖全局状态——支持 Java 端从配置中心动态下发。
    """
    if not _ensure_agentscope():
        raise NotImplementedError("agentscope not available")

    from agentscope.models import OpenAIChatWrapper  # 延迟导入

    # config_name 在同进程内需唯一；用 endpoint+model 组合哈希避免碰撞
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

    # AgentScope 推荐的消息格式：Msg 对象列表
    from agentscope.message import Msg
    messages = [
        Msg(name="system", content=SYSTEM_PROMPT, role="system"),
        Msg(name="user",   content=_build_user_prompt(payload, enrichment), role="user"),
    ]

    response = model(messages)

    # 解析：ModelResponse.text 是助手回复的文本
    text = getattr(response, "text", None) or str(response)
    data = json.loads(text)
    data["model"] = model_name
    log.info("[agentscope] 分类完成 identity=%s confidence=%s",
             data.get("identity"), data.get("confidence"))
    return data


def _classify_openai_compatible(payload: dict, enrichment: dict,
                                 base_url: str, api_key: str, model: str) -> dict:
    """保底路径：agentscope 不可用时用 openai SDK 直调。"""
    from openai import OpenAI  # 延迟导入，未装也能跑 /health
    client = OpenAI(base_url=base_url, api_key=api_key)
    kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": _build_user_prompt(payload, enrichment)},
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
    log.info("[openai-compat] 分类完成 identity=%s confidence=%s",
             data.get("identity"), data.get("confidence"))
    return data


# ── 分类主流程 ────────────────────────────────────────────────────────────────

def classify(payload: dict) -> dict:
    company = payload.get("company") or ""
    enrichment = enrich_company(company)
    degraded = bool(enrichment.get("degraded"))

    # 凭证：优先用 Java 端从配置中心随请求下发的 llm 字段；缺省回退环境变量
    llm = payload.get("llm") or {}
    base_url   = (llm.get("base_url")  or LLM_BASE_URL or "").strip()
    api_key    = (llm.get("api_key")   or LLM_API_KEY  or "").strip()
    model_name = (llm.get("model")     or LLM_MODEL    or "").strip()

    if not api_key:
        return {
            "identity": "UNKNOWN", "relationship": "NONE", "confidence": 0.0,
            "rationale": "未配置 LLM key，无法判别灰区",
            "evidence": ["LLM api_key 缺失（配置中心 4sapi 或 VA_LLM_API_KEY 均未设置）"],
            "model": model_name, "degraded": True,
        }

    # 优先走 AgentScope 路径（有治理能力 + Studio 可观测）；不可用时自动回退 OpenAI SDK
    try:
        data = _classify_with_agentscope(payload, enrichment, base_url, api_key, model_name)
    except Exception as exc:
        if not isinstance(exc, NotImplementedError):
            log.warning("[agentscope] 调用失败，回退 OpenAI SDK: %s", exc)
        data = _classify_openai_compatible(payload, enrichment, base_url, api_key, model_name)

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
    log.info("analyze company=%s visit_count=%s addr_norm=%s",
             payload.get("company"), payload.get("visit_count"), payload.get("addr_norm"))
    try:
        return JSONResponse(classify(payload))
    except Exception as e:  # noqa: BLE001
        log.exception("classify failed")
        return JSONResponse(status_code=500, content={"error": str(e)})
