# 视频智能变速 接口契约

> 配套设计文档：`视频智能变速-current.md`。本文件是接口字段级契约的唯一权威载体。
> 基址：`/api/video-condense`。所有路径相对此基址。

## 接口清单

| 方法 | 路径 | 用途 | 实现类#方法 |
|------|------|------|-------------|
| POST | `/analyze` | 提交分析作业，返回 jobId | `VideoCondenseController#analyze` |
| GET | `/jobs/{id}` | 查询作业状态 + 当前速度曲线 | `VideoCondenseController#getJob` |
| GET | `/jobs/{id}/events` | SSE 订阅作业进度 | `VideoCondenseController#events` |
| POST | `/render` | 用（可能微调过的）曲线触发渲染 | `VideoCondenseController#render` |
| POST | `/jobs/{id}/cancel` | 取消运行中的作业 | `VideoCondenseController#cancel` |
| GET | `/jobs/{id}/artifact` | 下载/预览产物 mp4 | `VideoCondenseController#artifact` |
| GET | `/jobs` | 最近作业列表 | `VideoCondenseController#recent` |

---

## 1. POST /analyze

提交一个视频做活动度分析，立即返回 jobId，分析异步进行。

**请求体**
```json
{ "path": "D:/records/coding-session.mp4" }
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 本地视频绝对路径；后端 normalize + isRegularFile 校验 |

**响应 200**
```json
{ "jobId": "a1b2c3d4" }
```

**错误**：`400` path 为空 / 非常规文件；`503` FFmpeg 不可用。

---

## 2. GET /jobs/{id}

**响应 200**（`JobView`）
```json
{
  "jobId": "a1b2c3d4",
  "status": "ANALYZED",
  "inputPath": "D:/records/coding-session.mp4",
  "durationSec": 3600.0,
  "progress": 1.0,
  "segments": [
    { "start": 0.0, "end": 12.5, "speed": 1.0, "type": "NORMAL", "score": 0.81 },
    { "start": 12.5, "end": 48.0, "speed": 6.0, "type": "FREEZE", "score": 0.05 }
  ],
  "error": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| status | enum | `PENDING/ANALYZING/ANALYZED/RENDERING/DONE/FAILED/CANCELLED` |
| durationSec | number | 原片时长（秒），探测得出 |
| progress | number | 0~1，仅 ANALYZING/RENDERING 阶段有意义，按已处理时长估算；其余阶段为 0 或 1 |
| segments | SegmentView[] | 当前速度曲线；ANALYZING 前为空 |
| error | string\|null | FAILED 时的简短原因 |

**SegmentView**

| 字段 | 类型 | 说明 |
|------|------|------|
| start / end | number | 段起止（秒，原片时间轴） |
| speed | number | 该段倍速（>0，1.0=原速） |
| type | enum | `NORMAL/TYPING/STREAMING/WAITING/KEY_MOMENT/FREEZE` |
| score | number | 活动度分数 0~1（仅展示，渲染只认 speed） |

**错误**：`404` 作业不存在。

---

## 3. GET /jobs/{id}/events （SSE）

`text/event-stream`，事件名固定 `progress`，data 为 `JobView` 的 JSON。终态（DONE/FAILED/CANCELLED）推送后服务端 complete。

```
event: progress
data: {"jobId":"a1b2c3d4","status":"ANALYZING","progress":0.42,...}

event: progress
data: {"jobId":"a1b2c3d4","status":"ANALYZED","segments":[...],...}
```

> `progress`（0~1）仅 ANALYZING/RENDERING 阶段有意义，按已处理时长估算。

---

## 4. POST /render

用曲线渲染输出。曲线可为分析原值，也可为前端微调后的版本。

**请求体**
```json
{
  "jobId": "a1b2c3d4",
  "segments": [
    { "start": 0.0, "end": 12.5, "speed": 1.0 },
    { "start": 12.5, "end": 48.0, "speed": 8.0 }
  ],
  "musicPath": "D:/music/bgm.mp3"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| jobId | string | 是 | 须为已 ANALYZED 的作业 |
| segments | {start,end,speed}[] | 是 | 渲染用曲线；后端只读 start/end/speed |
| musicPath | string | 否 | 背景音乐绝对路径，normalize+isRegularFile 校验；省略=无声输出 |

> segments 未覆盖的区间视为「跳过」（剪掉不输出）；区间不得重叠。

**响应 200**
```json
{ "jobId": "a1b2c3d4", "status": "RENDERING" }
```

**错误**：`400` 作业非 ANALYZED / segments 为空或非法（speed≤0、区间重叠）/ musicPath 非法路径；`404` 作业不存在。

---

## 5. POST /jobs/{id}/cancel

**响应 200**：返回当前 `JobView`（运行中 → CANCELLED；已是终态则幂等返回原状态，强杀在跑的 ffmpeg）。
**错误**：`404` 不存在。

---

## 6. GET /jobs/{id}/artifact

成功返回 `video/mp4`（支持 Range）。
**错误**：`404` 作业不存在 / 未 DONE / 产物缺失。

---

## 7. GET /jobs

**响应 200**：`JobView[]`（按 createdAt 倒序，limit 默认 20）。

---

## 错误响应统一格式

走项目 `GlobalExceptionHandler`：
```json
{ "error": "path 不能为空" }
```
