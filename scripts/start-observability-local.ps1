# 启动或复用本机 Phoenix，供 kai-toolbox 通过标准 OTLP/HTTP 上报 Trace。
# Phoenix 只绑定 127.0.0.1，并使用命名卷持久化内置 SQLite。

param(
    [int]$PhoenixPort = 6006,
    [ValidateRange(1, 300)]
    [int]$StartupTimeoutSeconds = 60
)

$ErrorActionPreference = 'Continue'
$ContainerName = 'kai-phoenix'
$PhoenixImage = 'arizephoenix/phoenix:latest'
$DataVolume = 'kai-phoenix-data'

function Test-TcpPort([int]$port, [int]$timeoutMilliseconds = 500) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync('127.0.0.1', $port)
        return $connectTask.Wait($timeoutMilliseconds) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Test-PhoenixReady {
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(2)
    try {
        $response = $client.GetAsync("http://127.0.0.1:$PhoenixPort").GetAwaiter().GetResult()
        return $response.IsSuccessStatusCode
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Wait-Phoenix {
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    do {
        if (Test-PhoenixReady) { return $true }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    return $false
}

if ((Test-TcpPort $PhoenixPort) -and (Test-PhoenixReady)) {
    Write-Host "[observability] 已复用 Phoenix：http://127.0.0.1:$PhoenixPort"
    Write-Host "[observability] OTLP/HTTP：http://127.0.0.1:$PhoenixPort/v1/traces"
    exit 0
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host '[observability] WARN: 未找到 Docker，Phoenix 无法启动；业务系统继续启动'
    exit 1
}

$containerId = (& $docker.Source container ls -aq --filter "name=^/$ContainerName$" 2>$null | Select-Object -First 1)
if ($LASTEXITCODE -ne 0) {
    Write-Host '[observability] WARN: Docker 服务不可用，请启动 Docker Desktop；业务系统继续启动'
    exit 1
}

$started = $false
if ($containerId) {
    $running = (& $docker.Source inspect --format '{{.State.Running}}' $ContainerName 2>$null | Select-Object -First 1)
    if ($running -eq 'true') {
        Write-Host "[observability] Phoenix 容器已运行，等待端口 $PhoenixPort"
        $started = $true
    } else {
        Write-Host "[observability] 启动已有 Phoenix 容器 $ContainerName ..."
        & $docker.Source start $ContainerName 2>&1 | Out-Null
        $started = $LASTEXITCODE -eq 0
    }
} else {
    Write-Host "[observability] 创建 Phoenix 容器（镜像 $PhoenixImage）..."
    $httpBinding = '127.0.0.1:{0}:6006' -f $PhoenixPort
    & $docker.Source run -d `
        --name $ContainerName `
        -p $httpBinding `
        -v "${DataVolume}:/root/.phoenix" `
        $PhoenixImage 2>&1 | Out-Null
    $started = $LASTEXITCODE -eq 0
}

if ($started -and (Wait-Phoenix)) {
    Write-Host "[observability] Phoenix 已就绪：http://127.0.0.1:$PhoenixPort"
    Write-Host "[observability] OTLP/HTTP：http://127.0.0.1:$PhoenixPort/v1/traces"
    exit 0
}

Write-Host '[observability] WARN: Phoenix 未能在等待时间内就绪；业务系统继续启动'
if ($containerId -or $started) {
    & $docker.Source logs --tail 12 $ContainerName 2>&1 | ForEach-Object { Write-Host "[observability] $_" }
}
exit 1
