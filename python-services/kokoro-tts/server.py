"""本地 Kokoro TTS 服务

kai-toolbox「云团语音模式」的文字转语音后端，与 faster-whisper（STT）对称：
- 本机 FastAPI/uvicorn，模型常驻内存，避免每次请求 cold load
- HTTP/JSON + raw body contract，Java 端 TextToSpeechClient 直连
- 一次性返回整段 wav（合成结果是单段音频，不需要 SSE 流）

启动方式见同目录 start.bat / README.md。
模型文件（kokoro-v1.0.onnx + voices-v1.0.bin）需手动下载，路径见 README。
"""
from __future__ import annotations

import io
import logging
import os

from fastapi import FastAPI, HTTPException, Request, Response

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
log = logging.getLogger("kokoro-tts-server")

MODEL_PATH = os.getenv("KOKORO_MODEL", "kokoro-v1.0.onnx")
VOICES_PATH = os.getenv("KOKORO_VOICES", "voices-v1.0.bin")
DEFAULT_VOICE = os.getenv("KOKORO_VOICE", "zf_xiaobei")
DEFAULT_LANG = os.getenv("KOKORO_LANG", "zh")

for _p in (MODEL_PATH, VOICES_PATH):
    if not os.path.exists(_p):
        raise SystemExit(
            f"[kokoro-tts] 缺少模型文件: {_p}\n"
            f"请下载 kokoro-v1.0.onnx 与 voices-v1.0.bin 放到本目录（见 README.md）。"
        )

log.info("loading kokoro model=%s voices=%s", MODEL_PATH, VOICES_PATH)
import soundfile as sf  # noqa: E402  延后到模型文件校验之后，import 失败信息更清晰
from kokoro_onnx import Kokoro  # noqa: E402

kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
log.info("model loaded, default voice=%s lang=%s, ready to serve", DEFAULT_VOICE, DEFAULT_LANG)

app = FastAPI(title="kai-toolbox kokoro TTS")


@app.get("/health")
def health() -> dict:
    """健康检查，Java 端 TextToSpeechClient 探测服务存活。"""
    return {"status": "ok", "voice": DEFAULT_VOICE, "lang": DEFAULT_LANG}


@app.post("/tts")
async def tts(request: Request):
    """把文本合成为 wav。

    协议：
    - query：``voice`` / ``lang`` / ``speed``
    - body：原始文本（``Content-Type: text/plain; charset=utf-8``）
    - 响应：``audio/wav`` 原始字节
    """
    raw = await request.body()
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        raise HTTPException(status_code=400, detail="待合成文本为空")

    voice = request.query_params.get("voice") or DEFAULT_VOICE
    lang = request.query_params.get("lang") or DEFAULT_LANG
    try:
        speed = float(request.query_params.get("speed", "1.0"))
    except ValueError:
        speed = 1.0

    try:
        samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
    except Exception as e:  # noqa: BLE001
        log.exception("tts synth failed voice=%s lang=%s", voice, lang)
        raise HTTPException(status_code=500, detail=f"合成失败: {e}") from e

    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV", subtype="PCM_16")
    wav = buf.getvalue()
    log.info("tts ok chars=%d voice=%s wav_bytes=%d", len(text), voice, len(wav))
    return Response(content=wav, media_type="audio/wav")
