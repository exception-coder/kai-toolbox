# 工作线模块示例数据灌入脚本（开付 2026.04.15–06 履历 · 二级结构）
# 用法：先重新构建并启动服务（含 v2 二级条目能力），再运行本脚本
#   mvn -pl toolbox-starter -am spring-boot:run     # 终端1：重启后端（迁移 Runner 会补 parent_id 列）
#   pwsh tools/tool-workline/seed-sample.ps1         # 终端2：灌数据
# 结构：一条工作线（这段经历）→ 顶层摘要条目 → 明细子条目（点击摘要展开查看）
# 脚本开头会清掉名字以「开付（KPay）」开头的旧示例工作线，可安全重复运行（不动其它工作线）

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:18080/api/workline'

function Post-Json($url, $obj) {
    $json = $obj | ConvertTo-Json -Depth 6
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)   # 显式 UTF-8，避免中文乱码
    return Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes
}

# ── 0) 清理旧示例工作线（仅匹配示例名，保护其它数据） ──
$existing = Invoke-RestMethod -Uri "$base/lines"
foreach ($l in $existing) {
    if ($l.name -like '开付（KPay）*') {
        Invoke-RestMethod -Uri "$base/lines/$($l.id)" -Method Delete | Out-Null
        Write-Host "清理旧工作线: $($l.name)"
    }
}

# ── 1) 工作线（这段经历整体陈述） ──
$created = Post-Json "$base/lines" @{
    name        = '开付（KPay）· 2026.04.15–2026.06'
    description = 'POS 退款退货模块主要开发者 · 240+ 提交 / 约 8 万行。点击下方摘要可展开明细。'
}
Write-Host "✓ 工作线: $($created.name) (id=$($created.id))"

# ── 2) 顶层摘要条目 + 各自的明细子条目 ──
$summaries = @(
    @{
        title       = '主导 POS 退款退货模块端到端重构'
        coreContent = '作为主要开发者重构 KPos 退款退货能力，覆盖全部退款业务场景，打通线上线下双退款通道，统一服务端分层架构并建立全链路日志。'
        achievement = '与云端账务口径完全对齐，解决了一批影响资金准确性的核心问题；退款准确到账、可追溯，可维护性与排查效率显著提升。'
        children    = @(
            @{
                title       = '重建退款核心能力'
                coreContent = '支持整单退、部分退、再次退款、联台单、AA 付 / 拆分支付等全部业务场景，并与云端账务口径完全对齐。'
                achievement = '解决了长期存在的「退款金额算错、状态显示错乱」类资金问题，保障退款金额与状态准确一致。'
            },
            @{
                title       = '打通线上线下退款回调'
                coreContent = '对接 KPay 线上、线下两种退款通道，实现回调的实时处理与异步兜底。'
                achievement = '保障退款结果准确到账、状态可追溯，避免回调丢失导致的对账差异。'
            },
            @{
                title       = '重构服务端架构'
                coreContent = '将原本散乱的退款逻辑统一为清晰的分层结构。'
                achievement = '提升代码可维护性，为后续退款、反结账、支付等模块的扩展打下基础。'
            },
            @{
                title       = '建立全链路日志与排查体系'
                coreContent = '实现按订单号一键追溯退款全过程。'
                achievement = '显著提升线上问题的定位效率。'
            }
        )
    },
    @{
        title       = '沉淀团队 AI 辅助研发工具链'
        coreContent = '独立开发并维护两套内部插件，把团队与 AI 协作的研发流程标准化。'
        achievement = '研发协作从「靠自觉」变为「自动拦截」，并减少重复手工操作，提升团队整体研发效率。'
        children    = @(
            @{
                title       = '研发规范插件'
                coreContent = '把「设计先行、文档留痕、编码规范、提交校验」等团队约定固化为可自动执行的检查机制。'
                achievement = '从「靠自觉」变为「自动拦截」，降低协作出错率。'
            },
            @{
                title       = '日常运维插件'
                coreContent = '集成线上日志查询、环境一键搭建、本地调试、问题排查等高频工具。'
                achievement = '减少重复性手工操作，提升团队日常开发效率。'
            }
        )
    }
)

foreach ($s in $summaries) {
    $top = Post-Json "$base/lines/$($created.id)/entries" @{
        title = $s.title; coreContent = $s.coreContent; achievement = $s.achievement
    }
    Write-Host "    ▸ $($s.title)"
    foreach ($c in $s.children) {
        Post-Json "$base/lines/$($created.id)/entries" @{
            title = $c.title; coreContent = $c.coreContent; achievement = $c.achievement; parentId = $top.id
        } | Out-Null
        Write-Host "        · $($c.title)"
    }
}

Write-Host "`n完成，打开 http://localhost:18080/tools/workline 查看效果。"
