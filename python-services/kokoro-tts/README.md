# kokoro-tts-server

本地 TTS（文字转语音）HTTP 服务，是 kai-toolbox「云团语音模式」让 AI **用声音回复**的后端。与 `faster-whisper`（STT，语音转文字）对称：一个把你的话转成文字，一个把 AI 的回复转成语音。

## 接口契约

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，Java 端探测服务存活 |
| POST | `/tts?voice=zf_xiaobei&lang=zh&speed=1.0` | body 为原始文本（`Content-Type: text/plain; charset=utf-8`），返回 `audio/wav` 字节 |

Java 端 `toolbox-common` 的 `TextToSpeechClient` 默认连 `http://127.0.0.1:9600`，可用 `toolbox.speech.tts-base-url` 改。

## 模型文件（需手动下载）

Kokoro 的 ONNX 权重不随 pip 安装，放到**本目录**：

| 文件 | 大小 | 来源 |
|---|---|---|
| `kokoro-v1.0.onnx` | ~310MB | https://github.com/thewh1teagle/kokoro-onnx/releases |
| `voices-v1.0.bin` | ~26MB | 同上 release 页 |

也可用环境变量指定别处：`set KOKORO_MODEL=D:\models\kokoro-v1.0.onnx`、`set KOKORO_VOICES=...`。

## 启动

需要 Python 3.10+。

### Windows
```cmd
start.bat
```
首次自动建 venv + 装依赖（含中文 G2P `misaki[zh]`，会带入 jieba 等）。

### Linux / macOS
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
KOKORO_VOICE=zf_xiaobei KOKORO_LANG=zh python -m uvicorn server:app --host 127.0.0.1 --port 9600
```

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `KOKORO_MODEL` | `kokoro-v1.0.onnx` | ONNX 权重路径 |
| `KOKORO_VOICES` | `voices-v1.0.bin` | 音色包路径 |
| `KOKORO_VOICE` | `zf_xiaobei` | 默认音色（中文女声）。其它如 `zf_xiaoni` / `zm_yunjian`（男声） |
| `KOKORO_LANG` | `zh` | 语言；中文用 `zh`，英文 `en-us` |

## 说明

- 中文需要 `misaki[zh]` 做 G2P（拼音/分词），requirements 已含。
- 服务只在本机监听，无鉴权（与 faster-whisper 一致）。
- 前端探测 `/api/claude-chat/tts/available`；服务没起时语音模式自动回落到「合成包络」动画（不报错、只是 AI 不出声）。
