# 原图分析与候选接入设计

## 边界与复用

复用 consult_service_client、consult_analysis_task、AgentOneShotRunner 和 Sidecar 的图片输入；不使用员工上传接口、不复制认证或任务体系。OBJ-01/CTX-01/IDEM-01：问题、会话、requestId 与应用归属稳定，附件引用属于本凭据绑定的企业；回查已完成任务不依赖图片仍在有效期。FEED-01/AI-01/EVID-01：失败说明可恢复路径，材料不提升为系统指令，原图证据不等于运行/数据库事实已核验。本次无页面改动。

## 上传与存储

POST /api/fore-consult/v1/attachments?uploadId=...，Content-Type 为 image/png 或 image/jpeg，body 为原始字节。单张 5MiB、最多 5 张/任务、合计 20MiB；边长不超过 10000、总像素不超过 2000 万。使用 JDK ImageIO 检测真实格式、尺寸并解码，拒绝损坏和动画 PNG；不接受 GIF/WebP/SVG/PDF/URL/路径，避免新增解码依赖和格式不完整支持。原字节存于本模块 SQLite BLOB，与静态文件隔离，无公开下载路径。

附件元数据和字节原子插入；clientId+uploadId 唯一，摘要为实际原字节 SHA-256，MIME 也必须一致。相同键同字节回原 ID，不同内容 409；超时先 GET 按 uploadId 恢复。24 小时后新任务/排队执行报 ATTACHMENT_EXPIRED，清理每分钟置空 BLOB（逻辑清理，不保证磁盘安全擦除或立即收缩数据库），元数据保留 30 天供幂等恢复后删除；30 天后不应复用历史 uploadId。任务持久化引用仍保留。读取元数据仅所属 clientId；跨凭据/企业统一 404，不泄露是否存在。轮换保持原 clientId 的引用，重新颁发的 clientId 不继承。

单凭据有效字节 25MiB、全局 100MiB，活跃元数据及保留记录上限分别为每凭据 2000/全局 10000；有界聚合由库内 SUM/COUNT 完成，不读全量 BLOB。单实例上传串行保护配额，SQLite 唯一键保护重复插入。清理只减少字节/删除过期元数据，不改变任务结果。无人工执行 SQL，新增幂等自动建表脚本；DDL 未核验：知识基线为 PARTIAL，缺少 consult_service_client、consult_analysis_task、consult_analysis_attachment 的已验证 DDL。列结构以仓库同模块 schema 为设计依据，不表示当前运行库已包含新表；自动初始化与运行库检查待授权加载时验证，本次未执行数据库变更。

## 分析与兼容

attachmentIds 可省略；replyMode 可省略或 CALLER/FORGE，默认沿用 CALLER。新字段省略时不进入规范化 JSON，旧任务 requestId 摘要保持可重试兼容。摘要包含有序附件 ID 与回复模式；上传内容不可变，因此换图片/文字/模式必冲突。优先查原任务，再检查新任务图片是否有效。

任务准入检查附件归属、有效期、数量/总量；执行前再次检查并读取原字节。执行器默认不声明受管图片能力；实际实现根据选中 Codex 账号 models_cache.json 的精确模型 input_modalities 判定，未知/缺失也拒绝，不按模型名猜测。多模态 runManaged 重载保留原取消与终态等待；默认实现遇到图片必须抛错，禁止悄悄降为文本。图片内容由已有 Sidecar 转成 SDK local_image；输入提示中的图片顺序、附件 ID、SHA-256 对应固定。

新增结果 schemaVersion 1.1（FORGE 或原图任务），纯文字旧模式仍 1.0。图片结果要求模型逐张给出 imageObservations，任何不可读/缺失回执均失败；服务端注入实际传入的 imageInputs 元数据用于追溯。回执不是模型语义准确性的证明，真实识图须实际验收。原图文字、历史、源码全为不可信资料，tools disabled。

FORGE 模式一次生成分析与三条候选，服务端验证恰好三条、每条 1–4000 字符、不同正文和真实 evidenceIds，固定赋 reply-1/2/3 后持久化，重复查询不重生成。模型指令要求同一事实、信息不足给追问、不谎称完成、不得含内部 SQL/凭据/日志；确定性检查拒绝可识别敏感/技术片段。自然语言真假与矛盾不能仅靠 JSON 验证保证，人工确认发送仍必需。旧 CALLER 结果不新增候选、不伪造模板。

## 研究与验收

2026-11-02 查阅 [OWASP 文件上传建议](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) 的真实类型、授权、配额与隔离存储要求；[OpenAI 图像输入说明](https://developers.openai.com/api/docs/guides/images-vision) 要求使用图像输入并说明小字/旋转等识别限制。按项目已装 SDK 和 JDK 收敛为 PNG/JPEG，不宣称上游所有格式都已支持。

验证覆盖认证隔离、图片解码/限额/过期/清理、上传与分析幂等、图片实际进入受管执行调用、候选结构/引用/失败、旧请求摘要与阅读、取消及 SDK。真实多模态模型运行和目标实例加载需单独授权后进行；不以 mock 的 taskId 冒充真实联调。
