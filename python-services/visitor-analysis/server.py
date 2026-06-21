"""访客分析 AgentScope sidecar

职责边界（与 Java 侧约定）：
- Java 已完成"确定性匹配"（客户库 / 竞品名单命中即定），命中的访客**不会**调到这里。
- 本服务只接 Java 判不了的"灰区"访客，做两件模糊事：
    ① enrich_company：企业数据增强（当前为模拟桩，自动降级）
    ② classify：把字段 + 增强数据交给 LLM，产出结构化分类提议
- 输出一律是"提议"，由 Java 端代码裁决（枚举校验 + 置信度阈值）后才落库。

为什么分类是"一次结构化输出调用"而不是 ReActAgent 工具循环：
  模型走第三方 OpenAI 兼容平台，function-calling 支持参差不齐；而确定性步骤都在 Java/本文件里
  按固定顺序跑，不需要让模型自己决定调哪个工具。这既稳又贴 deterministic-first。

AgentScope 集成点（学习目标）：
  下方 _classify_with_agentscope 是接 AgentScope 模型层 + OTel/Studio 观测的地方。
  当前默认走 _classify_openai_compatible（用 openai SDK，任何平台都能跑）。把 AgentScope 装好后
  按注释把模型调用换成 AgentScope 的 model 调用，token/cost/trace 就会出现在 Studio。
  文档：https://java.agentscope.io / https://doc.agentscope.io/tutorial/task_studio.html

启动见同目录 start.bat / README.md。
"""
from __future__ import annotations

import json
import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s")
log = logging.getLogger("visitor-analysis-sidecar")

# —— 模型配置：第三方 OpenAI 兼容平台。key 走环境变量，绝不写进仓库 ——
LLM_BASE_URL = os.getenv("VA_LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_API_KEY = os.getenv("VA_LLM_API_KEY", "")
LLM_MODEL = os.getenv("VA_LLM_MODEL", "deepseek-chat")

# 候选类别（与 Java 枚举 IdentityType / RelationshipType 保持一致）
IDENTITIES = ["CUSTOMER", "COMPETITOR", "VENDOR", "PARTNER", "JOB_SEEKER", "OFFICIAL", "UNKNOWN"]
RELATIONSHIPS = ["NEW", "EXISTING", "CHURNED", "NONE"]

app = FastAPI(title="kai-toolbox visitor-analysis sidecar")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": LLM_MODEL, "base_url": LLM_BASE_URL,
            "llm_ready": bool(LLM_API_KEY)}


def enrich_company(company: str) -> dict:
    """企业数据增强（模拟桩）。真实接入时换成企查查/天眼查适配器，签名不变。

    返回 degraded=True 表示未拿到真实数据，分类时据此降低置信度并标注。
    """
    if not company:
        return {"degraded": True, "industry": None, "biz_scope": None, "note": "无公司名"}
    # 桩：不调任何外部 API，直接返回降级标记。Java 端会把 degraded 体现在 needs_review。
    return {"degraded": True, "industry": None, "biz_scope": None,
            "note": "企业数据增强为模拟桩，未接入真实工商数据"}


SYSTEM_PROMPT = """你是企业前台访客身份判别助手。只依据给定信息判断访客身份，信息不足时果断选 UNKNOWN，不要编造。
身份(identity)只能从以下取值：CUSTOMER(客户) / COMPETITOR(竞争对手) / VENDOR(供应商) / PARTNER(合作伙伴) / JOB_SEEKER(求职者) / OFFICIAL(政府监管媒体) / UNKNOWN(无法识别)。
关系(relationship)仅当 identity=CUSTOMER 时有意义，取值：NEW(新客) / EXISTING(熟客) / CHURNED(流失)；其余情况一律 NONE。
注意：是否为已成交老客户由系统的客户库决定，不在你的判断范围；你只在"客户库未命中的灰区"里判断访客最可能的身份。
只输出 JSON，字段：identity, relationship, confidence(0~1 浮点), rationale(中文一句话理由), evidence(字符串数组，列出你依据的具体线索)。"""


def _build_user_prompt(payload: dict, enrichment: dict) -> str:
    fields = {
        "姓名": payload.get("name"),
        "手机号": payload.get("phone"),
        "公司": payload.get("company"),
        "公司地址": payload.get("company_addr"),
        "邮箱": payload.get("email"),
        "来访目的": payload.get("purpose"),
        "该访客历史来访次数": payload.get("visit_count"),
        "企业增强数据": enrichment,
    }
    return "访客信息如下，请判别：\n" + json.dumps(fields, ensure_ascii=False, indent=2)


def _classify_openai_compatible(payload: dict, enrichment: dict,
                                base_url: str, api_key: str, model: str) -> dict:
    """用 openai SDK 调第三方 OpenAI 兼容平台，要 JSON 结构化输出。"""
    from openai import OpenAI  # 延迟导入，未装也能跑 /health
    client = OpenAI(base_url=base_url, api_key=api_key)
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(payload, enrichment)},
        ],
        "response_format": {"type": "json_object"},
    }
    # 推理模型（gpt-5 / o 系列 / reasoner 等）只接受默认温度，传 temperature 会被网关拒绝。
    ml = model.lower()
    if not any(p in ml for p in ("gpt-5", "o1", "o3", "o4", "reasoner", "thinking", "qwq")):
        kwargs["temperature"] = 0.2
    resp = client.chat.completions.create(**kwargs)
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    data["model"] = model
    return data


def _classify_with_agentscope(payload: dict, enrichment: dict) -> dict:
    """AgentScope 集成点（学习目标，占位）。

    装好 agentscope 后，在这里用它的 model 层发起调用，并连上 Studio：
      from agentscope.model import OpenAIChatModel   # 或 DashScopeChatModel
      连 Studio 后 token / cost / trace 会自动可视化。
    目前未实现，抛出让调用方回退到 openai 兼容路径。
    """
    raise NotImplementedError


def classify(payload: dict) -> dict:
    company = payload.get("company") or ""
    enrichment = enrich_company(company)
    degraded = bool(enrichment.get("degraded"))

    # 优先用调用方（Java 后端从配置中心复用 4sapi）随请求下发的 LLM 配置；缺省回退本进程环境变量。
    llm = payload.get("llm") or {}
    base_url = (llm.get("base_url") or LLM_BASE_URL or "").strip()
    api_key = (llm.get("api_key") or LLM_API_KEY or "").strip()
    model = (llm.get("model") or LLM_MODEL or "").strip()

    if not api_key:
        # 没配 key（配置中心 4sapi 与 VA_LLM_API_KEY 均空）：不瞎判，返回 UNKNOWN 让 Java 端走人工确认。
        return {"identity": "UNKNOWN", "relationship": "NONE", "confidence": 0.0,
                "rationale": "未配置 LLM key，无法判别灰区",
                "evidence": ["LLM api_key 缺失（配置中心 4sapi 或 VA_LLM_API_KEY 均未设置）"], "model": model, "degraded": True}

    try:
        data = _classify_with_agentscope(payload, enrichment)
    except NotImplementedError:
        data = _classify_openai_compatible(payload, enrichment, base_url, api_key, model)

    # 归一化兜底：字段缺失/越界都给安全默认，最终裁决仍在 Java 端
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

    return {"identity": identity, "relationship": relationship, "confidence": confidence,
            "rationale": data.get("rationale", ""), "evidence": data.get("evidence", []),
            "model": data.get("model", model), "degraded": degraded}


@app.post("/analyze")
async def analyze(request: Request):
    payload = await request.json()
    log.info("analyze company=%s visit_count=%s", payload.get("company"), payload.get("visit_count"))
    try:
        return JSONResponse(classify(payload))
    except Exception as e:  # noqa: BLE001 - 任何异常都回 500，Java 端据此降级
        log.exception("classify failed")
        return JSONResponse(status_code=500, content={"error": str(e)})
