"""本地 faster-whisper ASR 服务

替代 whisper.cpp CLI 作为 kai-toolbox 字幕生成后端。比起 CLI 子进程：
- HTTP/JSON contract 取代 stderr 文本解析，参数错误立刻 400 而非 silent exit 0
- 模型常驻显存，连续多任务跑省去每次 cold load
- SSE 流式回 segment / progress，Java 端能实时更新进度
- 不再受 Windows ANSI codepage + CJK 路径影响（wav 以 raw body 上传到服务端临时文件）

启动方式见同目录 start.bat / README.md。
"""
from __future__ import annotations

import json
import logging
import os
import queue
import tempfile
import threading
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
log = logging.getLogger("faster-whisper-server")

# 模型在启动时加载一次，常驻 GPU 显存，避免每次请求 cold start
MODEL_NAME = os.getenv("WHISPER_MODEL", "medium")
DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")

log.info("loading model=%s device=%s compute_type=%s", MODEL_NAME, DEVICE, COMPUTE_TYPE)
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
log.info("model loaded, ready to serve")

app = FastAPI(title="kai-toolbox faster-whisper ASR")


@app.get("/health")
def health() -> dict:
    """简单健康检查，Java 端启动时可以打这个确认服务存活。"""
    return {"status": "ok", "model": MODEL_NAME, "device": DEVICE, "compute_type": COMPUTE_TYPE}


@app.post("/asr")
async def transcribe(request: Request):
    """转写音频文件。返回 text/event-stream，事件顺序：language → progress* + segment* → done。

    协议（无 multipart，绕开 starlette / python-multipart 的解析器 size 限制）：
    - query string：``language`` / ``initial_prompt`` / ``vad_filter``（URL 编码）
    - request body：原始 wav 字节流（``Content-Type: audio/wav``）

    历史：原先用 ``UploadFile + Form`` 走 multipart，starlette 的 ``MultiPartParser``
    在 1MB part 上限上吃过亏，把 ``max_part_size`` 改成 500MB 在某些版本不生效，
    几百 MB 的 wav 上传被解析器中途 close socket → Java 端 "Connection reset by peer"。
    改用 raw body 后整条路径只有 ``request.stream()`` 一次拷贝，没有任何 size 限制。

    出错时发 ``error`` 事件，HTTP 状态码仍是 200（SSE 协议无法在流中途改状态码）。
    Java 端见到 error 事件就抛业务异常即可。
    """
    # 协议错配防御：Java 端如果还跑旧的 multipart 代码,body 开头会是 "--<boundary>\r\n..."
    # 而不是 wav 头,后续 av.open() 会抛 InvalidDataError 一堆 ctypes 栈很难看。
    # 提前看 Content-Type,不匹配直接 400 + 操作建议,让前端日志一眼能定位。
    content_type = request.headers.get("content-type", "").lower()
    if "multipart" in content_type:
        raise HTTPException(
            status_code=400,
            detail=(
                "本服务已切到 raw body 协议（Content-Type: audio/wav + 原始 wav 字节）,"
                "收到的请求仍是 multipart/form-data。请重启 Spring Boot 拉新版 WhisperAsrClient 代码。"
            ),
        )

    language = request.query_params.get("language", "auto")
    initial_prompt = request.query_params.get("initial_prompt", "")
    vad_filter = request.query_params.get("vad_filter", "true").lower() == "true"

    # raw body 直接流式落盘。request.stream() 异步返回 chunk 已经是 bytes,
    # FastAPI/uvicorn 默认按 socket 读缓冲区大小切片(几十 KB ~ 几 MB),
    # 不会一次性吃整段 wav 进 Python 堆。
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        async for chunk in request.stream():
            if chunk:
                tmp.write(chunk)
        tmp_path = tmp.name

    # 落盘后做一次轻量体检:大小 + 文件头 magic。faster-whisper 内部 av.open 报
    # InvalidDataError 的 traceback 几乎不可读(都是 cython/ctypes 栈),自己提前判更友好。
    size = os.path.getsize(tmp_path)
    if size < 1024:
        # 16kHz mono PCM s16le 一秒 = 32KB,< 1KB 等价于「几乎啥都没传」
        os.unlink(tmp_path)
        raise HTTPException(
            status_code=400,
            detail=f"收到的 body 只有 {size}B,不是有效的 wav。检查上游 ffmpeg 抽音频是否成功。",
        )
    with open(tmp_path, "rb") as f:
        head = f.read(12)
    # WAV: "RIFF....WAVE" / MP3: "ID3" / WebM: 0x1A 0x45 0xDF 0xA3 / 其它 ffmpeg 能解的容器
    # 这里只挡最常见的两类异常:multipart 残留(0x2D 0x2D = "--")和 HTML 错误页(0x3C = "<")
    if head.startswith(b"--") or head.startswith(b"<"):
        # 把前几字节十六进制贴日志,方便 grep 出实际收到了啥协议头
        preview = head.hex()
        os.unlink(tmp_path)
        raise HTTPException(
            status_code=400,
            detail=(
                f"收到的 body 不是音频数据(前 12 字节={preview})。"
                f"通常是上游协议错配:multipart/HTML/纯文本被当成 wav 发了过来。"
                f"确认 Java 端 WhisperAsrClient 是 raw body 版本并已重启。"
            ),
        )

    def event_stream():
        try:
            kwargs = {
                "language": None if language == "auto" else language,
                "vad_filter": vad_filter,
                "beam_size": 5,
                # faster-whisper 默认 True：把上一段的转写文本拼进下一段的 prompt。
                # 长视频里只要中间某段出现幻觉/重复，污染会一路传染到结尾，常见的表现
                # 就是「视频前半段字幕正常、后半段整段空白」。关掉它每段独立解码，单点
                # 幻觉不会扩散；代价是跨段语境一致性略降（人名/术语建议靠 initial_prompt 喂）。
                "condition_on_previous_text": False,
                # 反幻觉三件套，专治视频中后段出现哭声/喘息/配乐等非语音内容时
                # whisper 整段重复输出 "(泣き声)" / "♪" / "(音楽)" 之类的 non-speech 标签。
                # no_speech_threshold 默认 0.6 → 0.75：低置信段直接判 no-speech 不输出。
                # log_prob_threshold 默认 -1.0 → -0.5：单段平均 log-prob 低于此值整段丢弃。
                # compression_ratio_threshold 默认 2.4 → 2.0：触发重复检测的阈值更敏感，
                # 同一短文本反复输出会被压缩比检测命中并提前终止。
                "no_speech_threshold": 0.75,
                "log_prob_threshold": -0.5,
                "compression_ratio_threshold": 2.0,
            }
            if initial_prompt:
                kwargs["initial_prompt"] = initial_prompt

            segments_gen, info = model.transcribe(tmp_path, **kwargs)
            log.info(
                "transcribe start tmp=%s language=%s duration=%.1fs prob=%.3f",
                os.path.basename(tmp_path), info.language, info.duration, info.language_probability,
            )

            yield _sse("language", {
                "language": info.language,
                "probability": info.language_probability,
            })

            duration = info.duration or 0.0
            vtt_lines = ["WEBVTT", ""]

            # 用 worker 线程拉 segment 进 queue，主迭代每 2 秒兜底发心跳进度。
            # 原因：faster-whisper 的 generator 只在 VAD 判定为语音的段产出 segment，
            # 中后段大量哭声/喘息被 VAD 过滤掉时 generator 可能几分钟不出东西，
            # 加上 Java 端整数百分比去重，UI 会卡 0% 让人以为服务挂了。
            q: queue.Queue = queue.Queue()
            DONE = object()

            def worker():
                try:
                    for seg in segments_gen:
                        q.put(seg)
                except Exception as exc:  # noqa: BLE001
                    q.put(("__error__", exc))
                finally:
                    q.put(DONE)

            threading.Thread(target=worker, name="asr-segments", daemon=True).start()

            # 预估 RTF：medium + CUDA 实测约 0.05-0.1。保守用 0.12 让心跳偏快被反超，
            # 避免末尾真实进度倒退回去。estimated_total 用作心跳进度分母。
            estimated_rtf = 0.12
            estimated_total = duration * estimated_rtf if duration > 0 else 600.0
            start_ts = time.monotonic()
            latest_end = 0.0
            seg_count = 0

            while True:
                try:
                    item = q.get(timeout=2.0)
                except queue.Empty:
                    # 心跳：max(基于真实 segment.end 的进度, 基于墙钟时间的估算)，
                    # 上限 95% 留给 done 之前的真实进度收尾。
                    elapsed = time.monotonic() - start_ts
                    est = min(0.95, elapsed / estimated_total) if estimated_total > 0 else 0
                    real = (latest_end / duration) if duration > 0 else 0
                    yield _sse("progress", {
                        "progress": max(real, est),
                        "current": latest_end,
                        "total": duration,
                        "heartbeat": True,
                    })
                    continue

                if item is DONE:
                    break
                if isinstance(item, tuple) and item[0] == "__error__":
                    raise item[1]

                segment = item
                seg_count += 1
                text = segment.text.strip()
                # 实时打印到 Python 控制台，方便观察转写进度和已识别内容。
                log.info("seg #%d %.2fs-%.2fs: %s",
                         seg_count, segment.start, segment.end, text)

                # 每个 segment 累计追加到 VTT 文本（done 事件时一次性返回完整 VTT）
                vtt_lines.append(
                    f"{_format_vtt_time(segment.start)} --> {_format_vtt_time(segment.end)}"
                )
                vtt_lines.append(text)
                vtt_lines.append("")

                latest_end = segment.end
                progress = min(0.99, segment.end / duration) if duration > 0 else 0.0
                yield _sse("progress", {
                    "progress": progress,
                    "current": segment.end,
                    "total": duration,
                })
                yield _sse("segment", {
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                })

            vtt = "\n".join(vtt_lines)
            log.info("transcribe done tmp=%s segments=%d vtt_bytes=%d",
                     os.path.basename(tmp_path), seg_count, len(vtt))
            yield _sse("done", {"vtt": vtt})
        except Exception as e:  # noqa: BLE001
            log.exception("transcription failed for %s", os.path.basename(tmp_path))
            yield _sse("error", {"message": str(e)})
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse(event: str, data: dict) -> str:
    """构造一帧 SSE 消息。事件名 + JSON data + 双换行结尾（SSE 协议规定）。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _format_vtt_time(seconds: float) -> str:
    """秒数转 VTT 时间戳格式 HH:MM:SS.mmm。"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"
