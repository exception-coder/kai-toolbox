# kai-toolbox 一键停止：把 run-supervised.ps1 拉起/守护的所有本地服务按端口全部停掉。
#
# run-supervised.ps1 是「一键启动」，但收尾并不干净：
#   - Ctrl+C 的 finally 只 Stop-Frontend + Stop-Backend；
#   - faster-whisper(9500) / 微信(9700) / 访客分析(9600) / AgentScope Studio(3000)
#     是独立进程/窗口，不进守护循环、
#     也不在 finally 里回收，会长期驻留占端口；
#   - claude-agent sidecar(18890) 是后端懒启动的子进程，java 先退时会变孤儿继续占端口。
# 本脚本按端口把它们一次清干净，供「全停」或「重来前先清场」用。
#
# Usage:
#   pwsh -File scripts\stop-supervised.ps1            # 停全部
#   pwsh -File scripts\stop-supervised.ps1 -KeepStudio  # 保留 AgentScope Studio(:3000)
#   pwsh -File scripts\stop-supervised.ps1 -Ports 18080,5173  # supervisor 已退出后，只清指定端口
#   pwsh -File scripts\stop-supervised.ps1 -IncludeObservability  # 同时停止 Aspire

param(
    [int[]]$Ports,
    [switch]$KeepStudio,
    [switch]$IncludeObservability
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$normalizedRepo = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\').ToLowerInvariant()
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $repoHashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalizedRepo))
} finally {
    $sha256.Dispose()
}
$repoHash = ([System.BitConverter]::ToString($repoHashBytes)).Replace('-', '').Substring(0, 16)
$supervisorStateRoot = Join-Path (
    $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() })
) 'kai-toolbox'
$supervisorPidFile = Join-Path $supervisorStateRoot "supervisor-$repoHash.pid"
$supervisorScriptPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'run-supervised.ps1'))

function Stop-SupervisorWorker {
    if (-not (Test-Path -LiteralPath $supervisorPidFile)) { return }
    $recorded = ''
    try { $recorded = [System.IO.File]::ReadAllText($supervisorPidFile).Trim() } catch { }
    $workerPid = 0
    if (-not [int]::TryParse($recorded, [ref]$workerPid) -or $workerPid -le 0) {
        Write-Host '[stop] supervisor PID 文件无效，移除陈旧记录'
        Remove-Item -LiteralPath $supervisorPidFile -Force -ErrorAction SilentlyContinue
        return
    }
    try {
        $worker = Get-CimInstance Win32_Process -Filter "ProcessId=$workerPid" -ErrorAction Stop
        $commandLine = "$($worker.CommandLine)"
        if ($commandLine.IndexOf($supervisorScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0 -or
            $commandLine -notmatch '(?i)-SupervisorWorker') {
            Write-Host "[stop] PID=$workerPid 不是当前仓库的 supervisor worker，拒绝终止并移除陈旧记录"
            Remove-Item -LiteralPath $supervisorPidFile -Force -ErrorAction SilentlyContinue
            return
        }
        # 这里只停 worker 本体；随后按端口精确回收子服务，才能继续遵守 -KeepStudio。
        Write-Host "[stop] 停止 supervisor worker PID=$workerPid"
        & taskkill /PID $workerPid /F 2>&1 | Out-Null
    } catch {
        Write-Host "[stop] supervisor worker PID=$workerPid 已不存在，清理陈旧记录"
    } finally {
        Remove-Item -LiteralPath $supervisorPidFile -Force -ErrorAction SilentlyContinue
    }
}

function Stop-LocalObservability {
    $stopScript = Join-Path $PSScriptRoot 'stop-observability-local.ps1'
    if (Test-Path -LiteralPath $stopScript) {
        & $stopScript
    } else {
        Write-Host '[stop] WARN: 未找到 scripts/stop-observability-local.ps1'
    }
}

function Resolve-HttpSysListenerProcessId([int]$port) {
    $serviceState = (& netsh http show servicestate view=requestq verbose=yes 2>$null) -join "`n"
    if ([string]::IsNullOrWhiteSpace($serviceState)) { return $null }
    $requestQueues = [regex]::Split($serviceState, '(?m)(?=^Request queue name:)')
    $urlPattern = "(?i)HTTP://\S+:$port(?:[:/])"
    foreach ($requestQueue in $requestQueues) {
        if ($requestQueue -notmatch $urlPattern) { continue }
        if ($requestQueue -match '(?m)^\s*ID:\s*(\d+),') { return [int]$Matches[1] }
    }
    return $null
}

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
    if ($pids -contains 4) {
        $httpSysProcessId = Resolve-HttpSysListenerProcessId $port
        $pids = @($pids | Where-Object { $_ -ne 4 })
        if ($httpSysProcessId) {
            $pids += $httpSysProcessId
        } else {
            Write-Host "[stop] WARN: :$port 由 HTTP.sys 监听，但无法解析真实进程；拒绝结束系统 PID=4"
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
    @{ Port = 9500;  Label = 'faster-whisper sidecar' },
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
    if ($IncludeObservability) { Stop-LocalObservability }
    Write-Host '[stop] 指定端口已处理完毕。'
    return
}

Write-Host '[stop] 停止 kai-toolbox 全部本地服务...'
Stop-SupervisorWorker
foreach ($svc in $services) {
    if ($KeepStudio -and $svc.Port -eq 3000) {
        Write-Host '[stop] -KeepStudio：保留 AgentScope Studio(:3000)'
        continue
    }
    Stop-PortHolders $svc.Port $svc.Label
}
if ($IncludeObservability) { Stop-LocalObservability }
Write-Host '[stop] 完成。'
