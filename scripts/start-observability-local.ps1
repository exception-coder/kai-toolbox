# 启动或复用本机 Aspire Dashboard，供 kai-toolbox 通过 OTLP/HTTP 上报 Trace。
# Dashboard 只绑定 127.0.0.1；匿名访问仅用于本机开发。

param(
    [int]$DashboardPort = 18888,
    [int]$OtlpGrpcPort = 18889,
    [int]$OtlpHttpPort = 4318,
    [ValidateRange(1, 300)]
    [int]$StartupTimeoutSeconds = 60
)

$ErrorActionPreference = 'Continue'

$ContainerName = 'kai-otel-dashboard'
$DashboardImage = 'mcr.microsoft.com/dotnet/aspire-dashboard:13.3.0'
$AspireCliPackage = '@microsoft/aspire-cli@13.4.6'
$AspireCliRegistry = 'https://registry.npmjs.org'
$PidFile = Join-Path ([System.IO.Path]::GetTempPath()) 'kai-toolbox-aspire-dashboard.pid'
$StdoutLog = Join-Path ([System.IO.Path]::GetTempPath()) 'kai-toolbox-aspire-dashboard.stdout.log'
$StderrLog = Join-Path ([System.IO.Path]::GetTempPath()) 'kai-toolbox-aspire-dashboard.stderr.log'
$env:ASPIRE_CLI_TELEMETRY_OPTOUT = '1'

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

function Wait-OtlpEndpoint {
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    do {
        if (Test-TcpPort $OtlpHttpPort) { return $true }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    return $false
}

function Save-ProcessId([System.Diagnostics.Process]$process) {
    if ($process) {
        Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ascii
    }
}

function Start-DashboardProcess([string]$filePath, [string[]]$arguments) {
    Remove-Item -LiteralPath $StdoutLog, $StderrLog -Force -ErrorAction SilentlyContinue
    return Start-Process -FilePath $filePath `
        -ArgumentList $arguments `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError $StderrLog `
        -WindowStyle Hidden -PassThru -ErrorAction Stop
}

function Wait-DashboardProcess([System.Diagnostics.Process]$process) {
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    do {
        if (Test-TcpPort $OtlpHttpPort) { return 'READY' }
        $process.Refresh()
        if ($process.HasExited) { return 'FAILED' }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    return 'STARTING'
}

function Write-DashboardFailure([System.Diagnostics.Process]$process) {
    $process.WaitForExit()
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "[observability] WARN: Aspire CLI 已退出，exitCode=$($process.ExitCode)"
    foreach ($logFile in @($StderrLog, $StdoutLog)) {
        if (-not (Test-Path -LiteralPath $logFile)) { continue }
        Get-Content -LiteralPath $logFile -Encoding UTF8 -Tail 12 -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "[observability] $_" }
    }
}

if (Test-TcpPort $OtlpHttpPort) {
    Write-Host "[observability] 已复用本机 OTLP/HTTP 端点 http://127.0.0.1:$OtlpHttpPort"
    Write-Host "[observability] Aspire Dashboard: http://127.0.0.1:$DashboardPort"
    exit 0
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
    $containerId = (& $docker.Source container ls -aq --filter "name=^/$ContainerName$" 2>$null | Select-Object -First 1)
    $dockerAvailable = $LASTEXITCODE -eq 0
    $dockerStartSucceeded = $false
    if (-not $dockerAvailable) {
        Write-Host '[observability] WARN: Docker 命令存在但服务不可用，直接尝试 CLI 回退'
    } elseif ($containerId) {
        $running = (& $docker.Source inspect --format '{{.State.Running}}' $ContainerName 2>$null | Select-Object -First 1)
        if ($running -eq 'true') {
            Write-Host "[observability] Aspire Dashboard 容器已运行，等待 OTLP/HTTP :$OtlpHttpPort"
            $dockerStartSucceeded = $true
        } else {
            Write-Host "[observability] 启动已有 Aspire Dashboard 容器 $ContainerName ..."
            & $docker.Source start $ContainerName 2>&1 | Out-Null
            $dockerStartSucceeded = $LASTEXITCODE -eq 0
        }
    } elseif ($dockerAvailable) {
        Write-Host "[observability] 创建 Aspire Dashboard 容器（镜像 $DashboardImage）..."
        $dashboardBinding = '127.0.0.1:{0}:18888' -f $DashboardPort
        $grpcBinding = '127.0.0.1:{0}:18889' -f $OtlpGrpcPort
        $httpBinding = '127.0.0.1:{0}:18890' -f $OtlpHttpPort
        & $docker.Source run -d `
            --name $ContainerName `
            -p $dashboardBinding `
            -p $grpcBinding `
            -p $httpBinding `
            -e ASPIRE_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true `
            -e ASPIRE_DASHBOARD_TELEMETRY_OPTOUT=true `
            -e DOTNET_CLI_TELEMETRY_OPTOUT=1 `
            $DashboardImage 2>&1 | Out-Null
        $dockerStartSucceeded = $LASTEXITCODE -eq 0
    }

    if ($dockerStartSucceeded) {
        if (Wait-OtlpEndpoint) {
            Write-Host "[observability] Aspire Dashboard 已就绪：http://127.0.0.1:$DashboardPort（OTLP/HTTP :$OtlpHttpPort）"
            exit 0
        }
        Write-Host '[observability] WARN: Docker Aspire Dashboard 未在等待时间内就绪，尝试 CLI 回退'
    }
}

$aspire = Get-Command aspire -ErrorAction SilentlyContinue
$dashboardProcess = $null
try {
    if ($aspire) {
        Write-Host '[observability] 使用本机 Aspire CLI 启动 Dashboard ...'
        $dashboardProcess = Start-DashboardProcess $aspire.Source @(
                'dashboard', 'run', '--allow-anonymous',
                '--frontend-url', "http://127.0.0.1:$DashboardPort",
                '--otlp-grpc-url', "http://127.0.0.1:$OtlpGrpcPort",
                '--otlp-http-url', "http://127.0.0.1:$OtlpHttpPort"
            )
    } else {
        $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
        if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
        if ($npx) {
            Write-Host "[observability] Docker/Aspire CLI 不可用，使用 npx + 官方 registry 启动 Aspire Dashboard（首次约下载 144 MB）..."
            $dashboardProcess = Start-DashboardProcess $npx.Source @(
                    '-y', "--registry=$AspireCliRegistry", $AspireCliPackage,
                    'dashboard', 'run', '--allow-anonymous',
                    '--frontend-url', "http://127.0.0.1:$DashboardPort",
                    '--otlp-grpc-url', "http://127.0.0.1:$OtlpGrpcPort",
                    '--otlp-http-url', "http://127.0.0.1:$OtlpHttpPort"
                )
        }
    }
} catch {
    Write-Host "[observability] WARN: Aspire CLI 启动失败：$($_.Exception.Message)"
}

if ($dashboardProcess) {
    Save-ProcessId $dashboardProcess
    $dashboardState = Wait-DashboardProcess $dashboardProcess
    switch ($dashboardState) {
        'READY' {
            Write-Host "[observability] Aspire Dashboard 已就绪：http://127.0.0.1:$DashboardPort（OTLP/HTTP :$OtlpHttpPort）"
            exit 0
        }
        'FAILED' {
            Write-DashboardFailure $dashboardProcess
            exit 1
        }
        'STARTING' {
            Write-Host "[observability] Aspire CLI 仍在后台下载或启动，请稍后访问 http://127.0.0.1:$DashboardPort"
            Write-Host "[observability] 启动日志：$StdoutLog；错误日志：$StderrLog"
            exit 0
        }
    }
}

Write-Host '[observability] WARN: 未能启动 Aspire Dashboard；kai-toolbox 仍会继续启动，Trace 暂时无法上报'
exit 1
