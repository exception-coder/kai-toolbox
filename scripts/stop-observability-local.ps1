# 停止由 start-observability-local.ps1 启动的本机 Aspire Dashboard。
# Docker 容器仅停止、不删除，便于下次复用；镜像和其它容器不受影响。

param()

$ErrorActionPreference = 'Continue'

$ContainerName = 'kai-otel-dashboard'
$PidFile = Join-Path ([System.IO.Path]::GetTempPath()) 'kai-toolbox-aspire-dashboard.pid'
$stopped = $false

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
    $running = (& $docker.Source inspect --format '{{.State.Running}}' $ContainerName 2>$null | Select-Object -First 1)
    if ($running -eq 'true') {
        Write-Host "[observability] 停止 Aspire Dashboard 容器 $ContainerName（保留容器和镜像）..."
        & $docker.Source stop $ContainerName 2>&1 | Out-Null
        $stopped = $true
    }
}

if (Test-Path -LiteralPath $PidFile) {
    $savedPid = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($savedPid -match '^\d+$') {
        $process = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
        if ($process) {
            $commandLine = $null
            try {
                $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$savedPid" -ErrorAction Stop).CommandLine
            } catch { }
            if ("$commandLine" -match '(?i)(aspire(?:-cli)?).+dashboard') {
                Write-Host "[observability] 停止 Aspire Dashboard CLI 进程树 PID=$savedPid ..."
                & taskkill /PID $savedPid /T /F 2>&1 | Out-Null
                $stopped = $true
            } else {
                Write-Host "[observability] WARN: PID=$savedPid 已不属于 Aspire Dashboard，不执行停止"
            }
        }
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

if ($stopped) {
    Write-Host '[observability] Aspire Dashboard 已停止。'
} else {
    Write-Host '[observability] 未发现由 kai-toolbox 启动的 Aspire Dashboard，跳过。'
}
