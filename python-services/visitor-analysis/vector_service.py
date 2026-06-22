"""向量检索服务：Qdrant + Ollama bge-m3 嵌入，为灰区 LLM 判别提供历史相似记录上下文。

职责：
  - 索引客户记录（va_customers 集合）
  - 索引已判别的访客记录（va_visitors_labeled 集合）
  - 召回：新访客字段 → embed → Qdrant 搜索 → top-k 历史相似记录

降级策略：Qdrant 不可用 / 嵌入失败 → 返回空列表，主流程继续，不抛异常。

配置（环境变量，优先级从高到低）：
  QDRANT_URL       = http://localhost:6333   Qdrant REST 完整地址（显式覆盖，最高优先）
                     云端示例: https://xyz.us-east4.gcp.cloud.qdrant.io:6333
  TOOLBOX_QDRANT_HOST   = 主机/IP            复用 scripts/run-tools.conf 里与 Java/AI 秘书共用的
                     那份配置（run-supervised.ps1 注入为进程环境变量，子进程 sidecar 自动继承）。
                     只是主机名/IP，本服务按 REST 端口拼成 http://{host}:{port}。
  TOOLBOX_QDRANT_HTTP_PORT = 6333            上面 host 拼 URL 用的 REST 端口（Java 侧走 gRPC 6334，
                     本服务走 REST 6333；远端两端口都需放通）。
  QDRANT_API_KEY / TOOLBOX_QDRANT_API_KEY = （留空）  云端/带鉴权 Qdrant 的 API key（本地不需要）。
                     前者专属本服务，后者与 Java 侧共用 run-tools.conf 的同一把 key。
  VA_EMBED_BASE_URL= http://localhost:11434/v1  Ollama bge-m3 端点
  VA_EMBED_API_KEY = ollama                  Ollama 占位 key
  VA_EMBED_MODEL   = bge-m3                  嵌入模型（本地 Ollama）
  VA_EMBED_DIM     = 1024                    bge-m3 向量维度
  VA_VECTOR_THRESH = 0.70                    相似度阈值（低于此值不返回）
"""
from __future__ import annotations

import hashlib
import logging
import os
import threading
from typing import Optional

log = logging.getLogger("visitor-analysis-vector")

# ── 配置 ────────────────────────────────────────────────────────────────────

def _resolve_qdrant_url() -> str:
    """解析 Qdrant REST 地址，复用与 Java/AI 秘书共用的 run-tools.conf 配置。
    优先级：显式 QDRANT_URL > TOOLBOX_QDRANT_HOST 拼 REST 端口 > 本地默认。
    TOOLBOX_QDRANT_HOST 只是主机/IP（Java 侧拿它走 gRPC 6334），本服务走 REST，
    默认 6333，可用 TOOLBOX_QDRANT_HTTP_PORT 覆盖。
    """
    explicit = os.getenv("QDRANT_URL")
    if explicit:
        return explicit
    host = os.getenv("TOOLBOX_QDRANT_HOST")
    if host:
        port = os.getenv("TOOLBOX_QDRANT_HTTP_PORT", "6333")
        return f"http://{host}:{port}"
    return "http://localhost:6333"


QDRANT_URL     = _resolve_qdrant_url()
# 本服务专属 QDRANT_API_KEY 优先；否则复用 run-tools.conf 与 Java 共用的 TOOLBOX_QDRANT_API_KEY
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY") or os.getenv("TOOLBOX_QDRANT_API_KEY", "")
EMBED_BASE_URL = os.getenv("VA_EMBED_BASE_URL",   "http://localhost:11434/v1")
EMBED_API_KEY  = os.getenv("VA_EMBED_API_KEY",    "ollama")
EMBED_MODEL    = os.getenv("VA_EMBED_MODEL",      "bge-m3")
EMBED_DIM      = int(os.getenv("VA_EMBED_DIM",    "1024"))
VECTOR_THRESH  = float(os.getenv("VA_VECTOR_THRESH", "0.70"))

COLL_CUSTOMERS = "va_customers"        # 客户参考库
COLL_VISITORS  = "va_visitors_labeled" # 已判别的历史访客

# ── 单例状态 ─────────────────────────────────────────────────────────────────
_lock   = threading.Lock()
_client = None     # QdrantClient 单例
_ready  = False
_error  = ""


# ── Qdrant 客户端 ─────────────────────────────────────────────────────────────

def _get_client():
    """惰性初始化 Qdrant 客户端，失败返回 None（调用方做降级）。"""
    global _client, _ready, _error
    if _ready:
        return _client
    with _lock:
        if _ready:
            return _client
        try:
            from urllib.parse import urlparse
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams
            # 云端 Qdrant 需要 API key；本地 Docker 不需要（留空即可）
            kwargs: dict = {"url": QDRANT_URL, "timeout": 5}
            if QDRANT_API_KEY:
                kwargs["api_key"] = QDRANT_API_KEY
            # 本地 Qdrant 必须直连：绕开系统/环境代理（如 Clash 127.0.0.1:7897）。
            # 否则 httpx 会按 HTTP(S)_PROXY 把 localhost:6333 请求转给代理，代理连不上上游返回
            # 502 Bad Gateway。trust_env=False 透传到底层 httpx.Client，让它忽略代理环境变量。
            # 云端 URL 不动（保持默认 trust_env=True），以便仍可经代理出网。
            host = (urlparse(QDRANT_URL).hostname or "").lower()
            if host in ("localhost", "::1") or host.startswith("127."):
                kwargs["trust_env"] = False
            c = QdrantClient(**kwargs)
            # 确保两个集合存在
            existing = {col.name for col in c.get_collections().collections}
            for name in [COLL_CUSTOMERS, COLL_VISITORS]:
                if name not in existing:
                    c.create_collection(
                        collection_name=name,
                        vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
                    )
                    log.info("[vector] 创建集合: %s (dim=%d)", name, EMBED_DIM)
            _client = c
            _ready = True
            log.info("[vector] Qdrant 连接成功: %s  embed=%s/%s",
                     QDRANT_URL, EMBED_MODEL, EMBED_BASE_URL)
        except Exception as exc:
            _error = str(exc)
            log.warning("[vector] Qdrant 不可用，向量召回已禁用: %s", exc)
            _client = None
    return _client


# ── 嵌入 ──────────────────────────────────────────────────────────────────────

def _embed(text: str) -> Optional[list[float]]:
    """调 Ollama bge-m3 生成文本嵌入向量，失败返回 None。"""
    if not text or not text.strip():
        return None
    try:
        from openai import OpenAI
        resp = OpenAI(base_url=EMBED_BASE_URL, api_key=EMBED_API_KEY) \
                   .embeddings.create(model=EMBED_MODEL, input=text[:512])
        return resp.data[0].embedding
    except Exception as exc:
        log.warning("[vector] 嵌入失败 (%s): %s", EMBED_MODEL, exc)
        return None


def _build_text(record: dict) -> str:
    """把有信息量的字段拼成一段文本送去嵌入。
    顺序：归一化公司名 > 归一化地址 > 原始公司名 > 原始地址 > 来访目的
    这样做向量化时最有区分度的信息权重最高。
    """
    parts = [
        record.get("company_norm", ""),
        record.get("addr_norm", ""),
        record.get("company", ""),
        record.get("company_addr", ""),
        record.get("purpose", ""),
    ]
    return " ".join(p for p in parts if p)


def _point_id(collection: str, key: str) -> int:
    """字符串 key → 稳定的 uint63 point id（Qdrant 要求整数或 UUID）。"""
    return int(hashlib.sha256(f"{collection}:{key}".encode()).hexdigest()[:15], 16)


# ── 索引 ──────────────────────────────────────────────────────────────────────

def index_customer(customer: dict) -> bool:
    """
    索引一条客户参考库记录。
    customer 至少包含 company / company_norm；可含 addr_norm / status / id。
    """
    c = _get_client()
    if c is None:
        return False
    text = _build_text(customer)
    vector = _embed(text)
    if vector is None:
        return False
    try:
        from qdrant_client.models import PointStruct
        key = str(customer.get("id") or customer.get("company_norm") or text)
        c.upsert(
            collection_name=COLL_CUSTOMERS,
            points=[PointStruct(
                id=_point_id(COLL_CUSTOMERS, key),
                vector=vector,
                payload={
                    "company":      customer.get("company", ""),
                    "company_norm": customer.get("company_norm", ""),
                    "addr_norm":    customer.get("addr_norm", ""),
                    "status":       customer.get("status", ""),
                    "source":       "customer",
                },
            )],
        )
        log.debug("[vector] indexed customer: %s", customer.get("company", ""))
        return True
    except Exception as exc:
        log.warning("[vector] index_customer 失败: %s", exc)
        return False


def index_visitor(visitor: dict, identity: str, relationship: str, confidence: float) -> bool:
    """
    索引一条已判别的访客记录（作为历史案例供后续召回）。
    visitor 包含 company / company_norm / addr_norm / company_addr / purpose / id 等。
    """
    c = _get_client()
    if c is None:
        return False
    text = _build_text(visitor)
    vector = _embed(text)
    if vector is None:
        return False
    try:
        from qdrant_client.models import PointStruct
        key = str(visitor.get("id") or text)
        c.upsert(
            collection_name=COLL_VISITORS,
            points=[PointStruct(
                id=_point_id(COLL_VISITORS, key),
                vector=vector,
                payload={
                    "company":      visitor.get("company", ""),
                    "company_norm": visitor.get("company_norm", ""),
                    "addr_norm":    visitor.get("addr_norm", ""),
                    "purpose":      visitor.get("purpose", ""),
                    "identity":     identity,
                    "relationship": relationship,
                    "confidence":   round(confidence, 3),
                    "source":       "visitor",
                },
            )],
        )
        log.debug("[vector] indexed visitor: %s → %s/%s", visitor.get("company", ""), identity, relationship)
        return True
    except Exception as exc:
        log.warning("[vector] index_visitor 失败: %s", exc)
        return False


# ── 召回 ──────────────────────────────────────────────────────────────────────

def search_similar(payload: dict, limit: int = 3) -> list[dict]:
    """
    用新申请字段在去重底库（客户参照库 va_customers）里搜相似记录，按相似度降序取 top-limit。
    只查人工维护的客户库，不查判定历史 va_visitors_labeled——判定结果不参与召回，避免自我污染。
    任何失败均返回空列表，调用方不感知。
    """
    c = _get_client()
    if c is None:
        return []
    text = _build_text(payload)
    vector = _embed(text)
    if vector is None:
        return []
    try:
        results: list[dict] = []
        for coll in [COLL_CUSTOMERS]:
            # qdrant-client 1.10+ 移除了 .search()，统一走 .query_points()（query 传向量，取 .points）
            hits = c.query_points(
                collection_name=coll,
                query=vector,
                limit=limit,
                score_threshold=VECTOR_THRESH,
            ).points
            for hit in hits:
                results.append({"score": round(hit.score, 3), **(hit.payload or {})})
        results.sort(key=lambda x: x["score"], reverse=True)
        top = results[:limit]
        if top:
            log.info("[vector] 召回 %d 条相似记录（最高 %.2f）", len(top), top[0]["score"])
        return top
    except Exception as exc:
        log.warning("[vector] search_similar 失败: %s", exc)
        return []


# ── 清空 ──────────────────────────────────────────────────────────────────────

def clear_customers() -> dict:
    """清空客户参照库向量集合 va_customers 的全部点（集合本身保留）。用于「先清空再重新同步」。"""
    c = _get_client()
    if c is None:
        return {"ok": False, "error": _error or "Qdrant 不可用"}
    try:
        from qdrant_client.models import FilterSelector, Filter
        before = c.count(collection_name=COLL_CUSTOMERS).count
        c.delete(collection_name=COLL_CUSTOMERS, points_selector=FilterSelector(filter=Filter()))
        after = c.count(collection_name=COLL_CUSTOMERS).count
        log.info("[vector] 清空 va_customers: %d -> %d", before, after)
        return {"ok": True, "before": before, "after": after}
    except Exception as exc:
        log.warning("[vector] clear_customers 失败: %s", exc)
        return {"ok": False, "error": str(exc)}


# ── 状态 ──────────────────────────────────────────────────────────────────────

def status() -> dict:
    return {
        "ready":        _ready,
        "qdrant_url":   QDRANT_URL,
        "qdrant_authed": bool(QDRANT_API_KEY),   # 是否配了 API key（不暴露 key 本身）
        "embed_model":  EMBED_MODEL,
        "embed_url":    EMBED_BASE_URL,
        "error":        _error or None,
    }
