# faster-whisper-server

本地 ASR HTTP 服务，替代 whisper.cpp CLI 作为 kai-toolbox 的字幕生成后端。

## 为什么不再用 whisper.cpp CLI

- **参数解析脆弱**：whisper.cpp 不同版本 / 构建对 `-fa` / `-su` 等参数的处理不一致，错误时会静默打印 OPTIONS 帮助然后 exit 0，前端表现为「跑完了但没字幕」。
- **Windows + CJK 路径**：whisper.cpp 用 C++ `fopen` 走 ANSI codepage 写文件，中文用户目录（`C:\Users\<中文用户名>\`）下偶发写不出 VTT。
- **stderr 文本解析**：进度 / 语言检测的输出格式版本间漂移，每次升级 whisper.cpp 都要重新校准正则。

faster-whisper（CTranslate2 后端）比 whisper.cpp **快 4 倍**且更稳定，HTTP/JSON contract 也比 stderr 解析坚固得多。

## 启动

需要：
- Python 3.10+
- NVIDIA GPU + CUDA 12+（CPU 也能跑，但慢约 30 倍）

### Windows

```cmd
start.bat
```

首次运行自动建 venv、装依赖（约 3-5 分钟），下载默认 medium 模型（~1.4GB，存到 `%USERPROFILE%\.cache\huggingface\`）。

### Linux / macOS

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
WHISPER_MODEL=medium python -m uvicorn server:app --host 127.0.0.1 --port 9500
```

## 配置（环境变量）

| 变量 | 默认 | 选项 |
|---|---|---|
| `WHISPER_MODEL` | `medium` | `tiny` / `base` / `small` / `medium` / `large-v3` / `large-v3-turbo` |
| `WHISPER_DEVICE` | `cuda` | `cpu` / `cuda` |
| `WHISPER_COMPUTE_TYPE` | `float16` | `float16` / `int8_float16`（低显存 GPU）/ `int8`（CPU） |

推荐组合：
- 4060 Ti 16GB 跑 `large-v3-turbo` + `float16` —— 最高准确度且仍然飞快
- 显存紧张：`int8_float16` 把显存占用减半，精度损失 < 1%
- 纯 CPU：`tiny` 或 `base` + `int8`

## 接入 kai-toolbox

服务跑起来后，在 `application.yml` 设置：

```yaml
toolbox:
  whisper:
    mode: asr-service                     # 切到 HTTP 服务模式
    service-url: http://127.0.0.1:9500    # 跟服务端口对齐（9000 在 Windows + Hyper-V/Docker 环境下常被排除段保留）
```

重启 Spring Boot 主服务即可。SubtitleService 会通过 HTTP/SSE 调本服务跑字幕，不再 fork whisper-cli 子进程。

可以随时改回 `mode: cli` 退回到 whisper.cpp CLI 模式作 fallback。

## 接口

```
GET /health
  → {"status": "ok", "model": "medium", "device": "cuda", "compute_type": "float16"}

POST /asr?language=<...>&initial_prompt=<...>&vad_filter=true
  Content-Type: audio/wav
  body: 原始 wav 字节（任何 ffmpeg 能读的格式都行，但建议预处理成 16kHz mono PCM s16le）

  query 参数：
    language: ISO 639-1 code 或 "auto"
    initial_prompt: 可选，专有名词 / 上下文提示（URL 编码，CJK 支持）
    vad_filter: bool，是否启用内置 VAD（建议 true，长视频显著提速 + 减少幻觉）

  之所以走 raw body 而非 multipart：starlette 的 MultiPartParser 在大 wav 上
  撞 max_part_size 上限，class 属性改不动新版实现，几百 MB 上传会中途断流。

响应：text/event-stream

事件序列：
  event: language    data: {"language": "ja", "probability": 0.99}
  event: progress    data: {"progress": 0.42, "current": 1234.5, "total": 3000.0}
  event: segment     data: {"start": 12.3, "end": 14.5, "text": "..."}
  ...（多个 progress / segment 交替）
  event: done        data: {"vtt": "<完整 WEBVTT 文本>"}

  出错时：
  event: error       data: {"message": "..."}
```

## 模型下载位置

首次用某个模型会从 HuggingFace 自动下载到 `%USERPROFILE%\.cache\huggingface\hub\models--Systran--faster-whisper-<model>\`。

如果网络不通可以手动从 https://huggingface.co/Systran 下载放入对应目录，或者用 huggingface-cli 配代理：

```cmd
set HTTPS_PROXY=http://127.0.0.1:7897
python -c "from faster_whisper import WhisperModel; WhisperModel('medium')"
```
