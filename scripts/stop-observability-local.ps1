# 停止由 start-observability-local.ps1 管理的 Phoenix 容器。
# 只停止、不删除容器、镜像和 SQLite 命名卷。

param()

$ErrorActionPreference = 'Continue'
$ContainerName = 'kai-phoenix'

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host '[observability] 未找到 Docker，跳过 Phoenix 停止。'
    exit 0
}

$running = (& $docker.Source inspect --format '{{.State.Running}}' $ContainerName 2>$null | Select-Object -First 1)
if ($running -eq 'true') {
    Write-Host "[observability] 停止 Phoenix 容器 $ContainerName（保留 SQLite 数据卷）..."
    & $docker.Source stop $ContainerName 2>&1 | Out-Null
    Write-Host '[observability] Phoenix 已停止。'
} else {
    Write-Host '[observability] 未发现运行中的 Phoenix 容器，跳过。'
}
