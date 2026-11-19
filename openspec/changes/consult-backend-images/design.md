# 原图分析与候选接入设计

## 边界与复用

复用 consult_service_client、consult_analysis_task、AgentOneShotRunner 和 Sidecar 的图片输入；不使用员工上传接口、不复制认证或任务体系。OBJ-01/CTX-01/IDEM-01：问题、会话、requestId 与应用归属稳定，附件引用属于本凭据绑定的企业；回查已完成任务不依赖图片仍在有效期。FEED-01/AI-01/EVID-01：失败说明可恢复路径，材料不提升为系统指令，原图证据不等于运行/数据库事实已核验。本次无页面改动。

## 上传与存储

POST /api/fore-consult/v1/attachments?uploadId=...，Content-Type 为 image/png 或 image/jpeg，body 为原始字节。单张 5MiB、最多 5 张/任务、合计 20MiB；边长不超过 10000、总像素不超过 2000 万。使用 JDK ImageIO 检测真实格式、尺寸并解码，拒绝损坏和动画 PNG；不接受 GIF/WebP/SVG/PDF/URL/路径，避免新增解码依赖和格式不完整支持。原字节存于本模块 SQLite BLOB，与静态文件隔离，无公开下载路径。

附件元数据和字节原子插入；clientId+uploadId 唯一，摘要为实际原字节 SHA-256，MIME 也必须一致。相同键同字节回原 ID，不同内容 409；超时先 GET 按 uploadId 恢复。未被任务接收的图片24小时到期。任务准入与图片续期在同一SQLite事务提交，至少保留至准入后48小时，单张不得超过上传后7天；剩余最大生命周期不足48小时拒绝新任务并要求重新上传。原requestId恢复不续期，不自动重放中断任务；在保留窗口内可显式提交恢复任务，超过窗口须重新上传。清理与准入共用单实例图片锁，执行读取沿用同一expiresAt，不能只延缓清理却仍拒绝读取。

清理每分钟置空到期BLOB（逻辑清理，不保证磁盘安全擦除或立即收缩数据库）；仅元数据记录最多保留30天，并受独立的应用/全局数量上限约束，超过时优先删除最旧元数据。没有删除任何仍有字节的有效图片。幂等回查窗口因此是“至30天或更早的元数据淘汰”；调用方不得重新使用已结束的uploadId。任务持久化引用和结果不删除。读取元数据仅所属clientId；跨凭据/企业统一404。轮换保持原clientId的引用，重新颁发的clientId不继承。

单凭据有效字节默认256MiB、全局1GiB，有效图片数量分别2000/10000；仅元数据数量独立默认2000/10000。通过既有Spring配置前缀toolbox.fore-consult.backend.images调整，启动校验正数及全局不小于应用；不修改私有运行配置。IMAGE_QUOTA_EXCEEDED保持兼容，details.reason区分APP_BYTES/GLOBAL_BYTES/APP_COUNT/GLOBAL_COUNT，并给used/limit/incoming。上传前与每分钟清理；清理失败记录日志和最近状态，不能声称释放成功。

聚合在SQLite内完成，不向Java加载BLOB；配额计数与插入沿用单实例锁，不宣称支持多实例共享文件写入。管理员image-storage接口分别返回本应用/全局有效用量、过期残留、元数据、24小时新增、同应用重复字节、查询耗时及最近清理状态。物理诊断只读page_count/freelist_count/page_size、可选dbstat、数据库/WAL文件大小与磁盘余量，不自动VACUUM、checkpoint或扩容。dbstat缺失明确返回空值。全量聚合受有效及元数据上限约束；实际生产延迟待运行诊断，测试只证明查询正确性。

本次仅增加现表摘要查询索引，不新增业务表。DDL未核验：2026-11-19 prepare_sql_context返回DDL_MISSING（项目SQL扫描上限），Forge未绑定数据库资源；依据本模块consult-backend-schema.sql实施并在隔离SQLite验证，不能声称已核验或迁移运行库。

## 2026-11-19 跨任务复用

GET /api/fore-consult/v1/attachments/reusable按当前clientId、SHA256、媒体类型和剩余有效期查询，默认至少600秒，返回原回执；不续期、不新增uploadId别名、不跨应用共享，也不删除历史重复内容。复用失败仅确定404时上传；401、429、未知状态或超时不盲重试。SDK uploadOrReuseImage先按原uploadId恢复并核对内容，再查摘要复用，最后只发一次上传；调用方持久化实际返回的attachmentId/uploadId。并发不同uploadId同时查空仍可能产生重复，保留既有幂等合同，不引入新存储别名表。ITCS正式流程接线及原两组受阻样例验收需ITCS工程和运行环境，SDK实现不是生产接入完成。

保留窗口是有界保证，长期停机或超过48小时未执行/恢复的任务仍可能过期；既有已过期、已清空图片不可恢复。新版本上线前的待执行任务必须先核对剩余有效期，不能将新准入续期规则视为历史任务已经迁移。

## 分析与兼容

ITCS 使用 `analyze-once` 直接获取经校验的结果，ITCS 负责问题、输入、结果和重试的持久化。即时入口共享应用认证、项目授权、并发上限、模型和执行超时，接收图片引用但不接受上传附件 ID。内部执行 ID 只用于关联运行及取消，不登记任务或写入策略版本记录。requestId 仅关联调用，失败或断线按 ITCS 的策略重新发起，旧异步接口继续支持其他调用方。

ITCS 可提交 `imageRefs`。配置将固定 HTTPS 读取目录及服务票据绑定到一个 Forge 应用凭据 ID，调用方仅提供不透明图片 ID、类型和摘要。准入仅检查引用和配置，执行时读取并校验实际内容，不进入附件表和上传配额。原图由 ITCS 保留，Forge 保存任务引用、分析结果及图片证据元数据。既有模型适配器可使用执行期间的临时文件，失败和恢复沿用原任务状态规则。调用方不得把任意 URL 或读取凭据放进任务。

attachmentIds 可省略；replyMode 可省略或 CALLER/FORGE，默认沿用 CALLER。新字段省略时不进入规范化 JSON，旧任务 requestId 摘要保持可重试兼容。摘要包含有序附件 ID 与回复模式；上传内容不可变，因此换图片/文字/模式必冲突。优先查原任务，再检查新任务图片是否有效。

任务准入检查附件归属、有效期、数量/总量；执行前再次检查并读取原字节。执行器默认不声明受管图片能力；实际实现根据选中 Codex 账号 models_cache.json 的精确模型 input_modalities 判定，未知/缺失也拒绝，不按模型名猜测。多模态 runManaged 重载保留原取消与终态等待；默认实现遇到图片必须抛错，禁止悄悄降为文本。图片内容由已有 Sidecar 转成 SDK local_image；输入提示中的图片顺序、附件 ID、SHA-256 对应固定。

新增结果 schemaVersion 1.1（FORGE 或原图任务），纯文字旧模式仍 1.0。图片结果要求模型逐张给出 imageObservations，任何不可读/缺失回执均失败；服务端注入实际传入的 imageInputs 元数据用于追溯。回执不是模型语义准确性的证明，真实识图须实际验收。原图文字、历史、源码全为不可信资料，tools disabled。

FORGE 模式一次生成分析与三条候选，服务端验证恰好三条、每条 1–4000 字符、不同正文和真实 evidenceIds，固定赋 reply-1/2/3 后持久化，重复查询不重生成。模型指令要求同一事实、信息不足给追问、不谎称完成、不得含内部 SQL/凭据/日志；确定性检查拒绝可识别敏感/技术片段。自然语言真假与矛盾不能仅靠 JSON 验证保证，人工确认发送仍必需。旧 CALLER 结果不新增候选、不伪造模板。

## 研究与验收

2026-11-02 查阅 [OWASP 文件上传建议](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) 的真实类型、授权、配额与隔离存储要求；[OpenAI 图像输入说明](https://developers.openai.com/api/docs/guides/images-vision) 要求使用图像输入并说明小字/旋转等识别限制。按项目已装 SDK 和 JDK 收敛为 PNG/JPEG，不宣称上游所有格式都已支持。

验证覆盖认证隔离、图片解码/限额/过期/清理、上传与分析幂等、图片实际进入受管执行调用、候选结构/引用/失败、旧请求摘要与阅读、取消及 SDK。真实多模态模型运行和目标实例加载需单独授权后进行；不以 mock 的 taskId 冒充真实联调。
