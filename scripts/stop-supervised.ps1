# kai-toolbox 一键停止：把 run-supervised.ps1 拉起/守护的所有本地服务按端口全部停掉。
#
# run-supervised.ps1 是「一键启动」，但收尾并不干净：
#   - Ctrl+C 的 finally 只 Stop-Frontend + Stop-Backend；
#   - 微信(9700) / 访客分析(9600) / AgentScope Studio(3000) 是独立进程/窗口，不进守护循环、
#     也不在 finally 里回收，会长期驻留占端口；
#   - claude-agent sidecar(18890) 是后端懒启动的子进程，java 先退时会变孤儿继续占端口。
# 本脚本按端口把它们一次清干净，供「全停」或「重来前先清场」用。
#
# Usage:
#   pwsh -File scripts\stop-supervised.ps1            # 停全部
#   pwsh -File scripts\stop-supervised.ps1 -KeepStudio  # 保留 AgentScope Studio(:3000)
#   pwsh -File scripts\stop-supervised.ps1 -Ports 18080,5173  # 只停指定端口

param(
    [int[]]$Ports,
    [switch]$KeepStudio
)

$ErrorActionPreference = 'Continue'

function Initialize-Utf8Console {
    try {
        chcp.com 65001 > $null
        $utf8Encoding = [System.Text.UTF8Encoding]::new($false)
        [Console]::InputEncoding = $utf8Encoding
        [Console]::OutputEncoding = $utf8Encoding
        $global:OutputEncoding = $utf8Encoding
    } catch {
        Write-Host "[stop] UTF-8 console setup failed: $($_.Exception.Message)"
    }
}

Initialize-Utf8Console

# 与 run-supervised.ps1 完全一致的端口清理逻辑：Get-NetTCPConnection 优先，不可用回落 netstat。
function Stop-PortHolders([int]$port, [string]$label) {
    $pids = @()
    try {
        $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
                Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        foreach ($l in (netstat -ano | Select-String ":$port\s.*LISTENING")) {
            $tok = ($l.ToString().Trim() -split '\s+')[-1]
            if ($tok -match '^\d+$') { $pids += [int]$tok }
        }
    }
    $pids = $pids | Where-Object { $_ -and $_ -ne 0 } | Select-Object -Unique
    if (-not $pids) {
        Write-Host "[stop] :$port ($label) 未在监听，跳过"
        return
    }
    foreach ($procId in $pids) {
        Write-Host "[stop] 停止 :$port ($label) PID=$procId"
        & taskkill /PID $procId /T /F 2>&1 | Out-Null
    }
}

# 端口清单：与 run-supervised.ps1 的常量对应，标签便于阅读输出。
# 18081(supervisor 控制端点)放最后停——它就是 supervisor 进程本体，停掉即结束守护循环。
$services = @(
    @{ Port = 18890; Label = 'claude-agent sidecar' },
    @{ Port = 18080; Label = 'backend' },
    @{ Port = 5173;  Label = 'frontend (vite dev)' },
    @{ Port = 9600;  Label = 'visitor-analysis sidecar' },
    @{ Port = 9700;  Label = 'wechat sidecar' },
    @{ Port = 3000;  Label = 'AgentScope Studio' },
    @{ Port = 18081; Label = 'supervisor 控制端点' }
)

if ($Ports) {
    # 只停用户指定的端口
    foreach ($p in $Ports) {
        $svc = $services | Where-Object { $_.Port -eq $p } | Select-Object -First 1
        $label = if ($svc) { $svc.Label } else { 'custom' }
        Stop-PortHolders $p $label
    }
    Write-Host '[stop] 指定端口已处理完毕。'
    return
}

Write-Host '[stop] 停止 kai-toolbox 全部本地服务...'
foreach ($svc in $services) {
    if ($KeepStudio -and $svc.Port -eq 3000) {
        Write-Host '[stop] -KeepStudio：保留 AgentScope Studio(:3000)'
        continue
    }
    Stop-PortHolders $svc.Port $svc.Label
}
Write-Host '[stop] 完成。'
