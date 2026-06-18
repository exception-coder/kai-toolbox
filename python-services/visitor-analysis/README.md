# 访客分析 AgentScope sidecar

kai-toolbox「访客分析」工具的 Python 边车。只负责**灰区判别**——Java 端先做确定性匹配（客户库 / 竞品名单），命中即定论、不会调到这里；只有判不了的访客才交给本服务用 LLM 分类。

## 职责

1. `enrich_company`：企业数据增强（**当前为模拟桩**，自动降级；以后换企查查/天眼查适配器，签名不变）。
2. `classify`：把访客字段 + 增强数据交给 LLM，产出结构化分类提议（identity / relationship / confidence / rationale / evidence）。输出是「提议」，由 Java 端代码裁决后才落库。

分类刻意做成**一次结构化输出调用**而非 ReActAgent 工具循环：模型走第三方 OpenAI 兼容平台，function-calling 支持参差不齐；确定性步骤都在固定顺序里跑，不需要模型自己决定调哪个工具。既稳又贴「确定性优先」。

## 启动

```bat
set VA_LLM_BASE_URL=https://你的平台/v1
set VA_LLM_API_KEY=sk-xxxx
set VA_LLM_MODEL=模型名
start.bat
```

默认监听 `http://127.0.0.1:9600`。Java 端在 `application.yml` 的 `toolbox.visitor-analysis.sidecar-url` 指向它；**不启动也不影响 Java 的确定性判别**，灰区会降级为「待人工确认」。

- `GET /health` — 探活，返回模型配置与 `llm_ready`。
- `POST /analyze` — body 为访客 JSON，返回结构化提议。

## AgentScope 集成点（学习目标）

`server.py` 的 `_classify_with_agentscope` 是接 **AgentScope 模型层 + Studio 观测**的地方。当前默认走 `_classify_openai_compatible`（用 openai SDK，任何兼容平台都能跑）。

学习路径：
1. 取消 `requirements.txt` 里 `agentscope` / `agentscope[studio]` 的注释并安装。
2. 在 `_classify_with_agentscope` 里用 AgentScope 的 model 调用替换，并连上 Studio。
3. 启动 Studio，运行的 token / cost / trace 即可在其 UI 可视化。

Python 是 AgentScope 的旗舰 SDK（特性最全、更新最快），用它学最划算。

文档：
- https://doc.agentscope.io/tutorial/task_studio.html （Studio）
- https://docs.agentscope.io/observe-and-evaluate/observability （可观测性）
