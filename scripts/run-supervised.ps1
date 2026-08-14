# kai-toolbox backend supervisor with HTTP control endpoint
#
# Responsibilities:
#   1) Supervise backend with mvn spring-boot:run. Restart after exit or crash.
#   2) Keep an independent HTTP control endpoint on 127.0.0.1:18081:
#        POST /restart             restart the backend and Python sidecars
#        POST /reload|/full-reload stop the worker so the stable bootstrap reloads the full stack
#        GET  /status              report protocol/capabilities and backend health
#
# The frontend restart button calls this endpoint through the Vite /supervisor proxy.
# This supervisor owns both backend and frontend; Maven skips its embedded frontend build.
#
# Usage:
#   pwsh -File scripts\run-supervised.ps1                # dev + Aspire（默认）
#   pwsh -File scripts\run-supervised.ps1 -Mode full     # package + fat jar
#   pwsh -File scripts\run-supervised.ps1 -HotReload     # dev + 存盘即编译并热重启
#   pwsh -File scripts\run-supervised.ps1 -AutoUpdate    # 启用 Java 安全跟随 origin/main
#   pwsh -File scripts\run-supervised.ps1 -Observability langfuse
#   pwsh -File scripts\run-supervised.ps1 -Observability off
# Ctrl+C stops the supervisor loop.

param(
    [ValidateSet('dev', 'full')]
    [string]$Mode = 'dev',
    [ValidateSet('aspire', 'langfuse', 'off')]
    [string]$Observability = 'aspire',
    # 存盘即自动重启（源码监听 + DevTools 重启）。默认关：重启时机由人控制，
    # 走 POST /restart。热重启会换掉 Spring 上下文却留下旧上下文的后台线程/长连接
    # （claude-chat sidecar 就踩过：僵尸 bean 继续抢 sidecar，事件投递到没人看的一端），
    # 编译中途的半成品 class 也会触发无意义的重启。要用就显式开。
    [switch]$HotReload,
    # 兼容参数：启用 Java 内置自动更新调度；supervisor 本身不再轮询 Git。
    [switch]$AutoUpdate,
    # 近 24h 提交批次中位约 21min；120s 检查兼顾发现延迟与全天网络开销。
    [ValidateRange(30, 3600)]
    [int]$AutoUpdateIntervalSeconds = 120,
    # Internal worker flag. The stable bootstrap process owns the terminal and reloads this file after update.
    [Parameter(DontShow)]
    [switch]$SupervisorWorker
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
        Write-Host "[supervisor] UTF-8 console setup failed: $($_.Exception.Message)"
    }
}

Initialize-Utf8Console

$AutoUpdateRelaunchExitCode = 75

# Keep one stable process attached to the caller's terminal. The worker owns services and exits with a
# dedicated code after fast-forward; the bootstrap then loads the updated script without returning an
# interactive prompt or accumulating dormant parent generations.
if (-not $SupervisorWorker) {
    $workerArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'),
        '-SupervisorWorker', '-Mode', $Mode, '-Observability', $Observability
    )
    if ($HotReload) { $workerArgs += '-HotReload' }
    if ($AutoUpdate) { $workerArgs += '-AutoUpdate' }
    if ($PSBoundParameters.ContainsKey('AutoUpdateIntervalSeconds')) {
        $workerArgs += @('-AutoUpdateIntervalSeconds', "$AutoUpdateIntervalSeconds")
    }
    try {
        while ($true) {
            $worker = Start-Process -FilePath ([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName) `
                -ArgumentList $workerArgs -WorkingDirectory (Split-Path -Parent $PSScriptRoot) `
                -NoNewWindow -PassThru
            $worker.WaitForExit()
            if ($worker.ExitCode -eq $AutoUpdateRelaunchExitCode) {
                Write-Host '[supervisor-bootstrap] 云端更新已落地，加载最新 supervisor...'
                continue
            }
            exit $worker.ExitCode
        }
    } catch {
        Write-Host "[supervisor-bootstrap] worker 启动失败：$($_.Exception.Message)"
        exit 1
    }
}

# 从同目录 run-tools.conf（KEY=value，不提交到仓库）读取本机机密/配置，注入为进程环境变量。
# 已存在的同名环境变量优先，不被覆盖；可对照 run-tools.conf.example 创建本机文件。
$ToolsConfFile = Join-Path $PSScriptRoot 'run-tools.conf'
if (Test-Path -LiteralPath $ToolsConfFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($ToolsConfFile)) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        $k = $t.Substring(0, $i).Trim()
        $v = $t.Substring($i + 1).Trim()
        if (-not [Environment]::GetEnvironmentVariable($k, 'Process')) { Set-Item -Path "env:$k" -Value $v }
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

function ConvertTo-ConfigBoolean([string]$value, [bool]$defaultValue) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $defaultValue }
    switch ($value.Trim().ToLowerInvariant()) {
        { $_ -in @('1', 'true', 'yes', 'on') } { return $true }
        { $_ -in @('0', 'false', 'no', 'off') } { return $false }
        default { return $defaultValue }
    }
}

function Read-BoundedInteger([string]$value, [int]$defaultValue, [int]$minimum, [int]$maximum) {
    $parsed = 0
    if (-not [int]::TryParse($value, [ref]$parsed)) { return $defaultValue }
    return [Math]::Max($minimum, [Math]::Min($maximum, $parsed))
}

$script:JavaAutoUpdateEnabled = $AutoUpdate.IsPresent -or
    (ConvertTo-ConfigBoolean $env:TOOLBOX_AUTO_UPDATE_ENABLED $true)
if ($AutoUpdate.IsPresent) {
    # CLI 参数优先于 run-tools.conf，并通过环境传给 child Java。
    $env:TOOLBOX_AUTO_UPDATE_ENABLED = 'true'
} elseif ([string]::IsNullOrWhiteSpace($env:TOOLBOX_AUTO_UPDATE_ENABLED)) {
    $env:TOOLBOX_AUTO_UPDATE_ENABLED = if ($script:JavaAutoUpdateEnabled) { 'true' } else { 'false' }
}
if (-not $PSBoundParameters.ContainsKey('AutoUpdateIntervalSeconds')) {
    $AutoUpdateIntervalSeconds = Read-BoundedInteger $env:TOOLBOX_AUTO_UPDATE_INTERVAL_SECONDS 120 30 3600
} else {
    $env:TOOLBOX_AUTO_UPDATE_INTERVAL_SECONDS = "$AutoUpdateIntervalSeconds"
}
$script:AutoUpdateRemote = if ($env:TOOLBOX_AUTO_UPDATE_REMOTE) { $env:TOOLBOX_AUTO_UPDATE_REMOTE.Trim() } else { 'origin' }
$script:AutoUpdateBranch = if ($env:TOOLBOX_AUTO_UPDATE_BRANCH) { $env:TOOLBOX_AUTO_UPDATE_BRANCH.Trim() } else { 'main' }
$script:AutoUpdateStableSeconds = Read-BoundedInteger $env:TOOLBOX_AUTO_UPDATE_STABLE_SECONDS 120 30 1800
$script:AutoUpdateRequireIdle = ConvertTo-ConfigBoolean $env:TOOLBOX_AUTO_UPDATE_REQUIRE_IDLE $true
# Java is the only Git polling owner. Keep the previous supervisor state machine in this
# version for rolling-upgrade compatibility, but make it unreachable.
$script:AutoUpdateEnabled = $false

# A named mutex is the real single-instance guard. Port 18081 alone is insufficient: historically a
# second supervisor continued after bind failure and then repeatedly stole 18080/5173 from the first.
$normalizedRepo = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\').ToLowerInvariant()
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $repoHashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalizedRepo))
} finally {
    $sha256.Dispose()
}
$repoHash = ([System.BitConverter]::ToString($repoHashBytes)).Replace('-', '').Substring(0, 16)
$mutexName = "Global\KaiToolboxSupervisor-$repoHash"
try {
    $script:supervisorMutex = [System.Threading.Mutex]::new($false, $mutexName)
} catch [System.UnauthorizedAccessException] {
    # Some locked-down Windows environments deny Global kernel objects. Retain a session-local guard
    # rather than disabling supervision; the PID/control-port checks below remain the second line.
    $mutexName = "Local\KaiToolboxSupervisor-$repoHash"
    Write-Host '[supervisor] WARN: 无权创建全局单实例锁，回退到当前登录会话锁'
    $script:supervisorMutex = [System.Threading.Mutex]::new($false, $mutexName)
}
try {
    $script:supervisorMutexAcquired = $script:supervisorMutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
    $script:supervisorMutexAcquired = $true
}
if (-not $script:supervisorMutexAcquired) {
    Write-Host "[supervisor] 此仓库已有 supervisor 在运行，跳过重复实例：$RepoRoot"
    $script:supervisorMutex.Dispose()
    return
}
$supervisorStateRoot = Join-Path (
    if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() }
) 'kai-toolbox'
$script:supervisorPidFile = Join-Path $supervisorStateRoot "supervisor-$repoHash.pid"
try {
    [System.IO.Directory]::CreateDirectory($supervisorStateRoot) | Out-Null
    [System.IO.File]::WriteAllText(
        $script:supervisorPidFile, "$PID`r`n", [System.Text.UTF8Encoding]::new($false))
} catch {
    Write-Host "[supervisor] WARN: 无法写入 PID 文件：$($_.Exception.Message)"
}

function Read-DotEnvValue([string]$path, [string]$key) {
    foreach ($line in [System.IO.File]::ReadAllLines($path)) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1 -or $trimmed.Substring(0, $separator).Trim() -ne $key) { continue }
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
        return $value
    }
    return $null
}

function Remove-ProcessEnvironmentVariable([string]$name) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}

function Initialize-AspireObservability {
    $env:TOOLBOX_OBSERVABILITY_ENABLED = 'true'
    $env:OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318'
    $env:OTEL_SERVICE_NAME = 'kai-toolbox'
    $env:TOOLBOX_DEPLOYMENT_ENVIRONMENT = 'local'

    foreach ($name in @(
        'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
        'OTEL_EXPORTER_OTLP_HEADERS',
        'LANGFUSE_BASE_URL',
        'LANGFUSE_PUBLIC_KEY',
        'LANGFUSE_SECRET_KEY'
    )) { Remove-ProcessEnvironmentVariable $name }

    $startScript = Join-Path $PSScriptRoot 'start-observability-local.ps1'
    if (-not (Test-Path -LiteralPath $startScript)) {
        Write-Host '[supervisor] WARN: 未找到 scripts/start-observability-local.ps1，业务系统继续启动'
        return
    }
    & $startScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[supervisor] WARN: Aspire Dashboard 未就绪，业务系统继续启动'
        return
    }
    Write-Host '[supervisor] Aspire 观测已配置：OTLP/HTTP http://127.0.0.1:4318，Dashboard http://127.0.0.1:18888'
}

function Initialize-LangfuseObservability {
    $langfuseEnvFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'deploy\langfuse\.env'
    $hasEnvFile = Test-Path -LiteralPath $langfuseEnvFile
    $langfuseBaseUrl = if ($env:LANGFUSE_BASE_URL) { $env:LANGFUSE_BASE_URL } elseif ($hasEnvFile) { Read-DotEnvValue $langfuseEnvFile 'NEXTAUTH_URL' }
    $langfusePublicKey = if ($env:LANGFUSE_PUBLIC_KEY) { $env:LANGFUSE_PUBLIC_KEY } elseif ($hasEnvFile) { Read-DotEnvValue $langfuseEnvFile 'LANGFUSE_INIT_PROJECT_PUBLIC_KEY' }
    $langfuseSecretKey = if ($env:LANGFUSE_SECRET_KEY) { $env:LANGFUSE_SECRET_KEY } elseif ($hasEnvFile) { Read-DotEnvValue $langfuseEnvFile 'LANGFUSE_INIT_PROJECT_SECRET_KEY' }
    if ($langfuseBaseUrl -and $langfusePublicKey -and $langfuseSecretKey) {
        $env:LANGFUSE_BASE_URL = $langfuseBaseUrl
        $env:LANGFUSE_PUBLIC_KEY = $langfusePublicKey
        $env:LANGFUSE_SECRET_KEY = $langfuseSecretKey
        $env:TOOLBOX_OBSERVABILITY_ENABLED = 'true'
        Write-Host '[supervisor] Langfuse 观测配置已从 deploy/langfuse/.env 加载（密钥不输出）'
        if ($langfuseBaseUrl -notmatch '^https://') { Write-Host '[supervisor] WARN: Langfuse 当前不是 HTTPS，公网传输密钥存在风险' }
        return
    }

    if ($env:OTEL_EXPORTER_OTLP_TRACES_ENDPOINT -or $env:OTEL_EXPORTER_OTLP_ENDPOINT) {
        $env:TOOLBOX_OBSERVABILITY_ENABLED = 'true'
        Write-Host '[supervisor] WARN: Langfuse 项目配置不完整，继续使用显式 OTLP Endpoint'
        return
    }

    $env:TOOLBOX_OBSERVABILITY_ENABLED = 'false'
    Write-Host '[supervisor] WARN: Langfuse URL 或项目密钥缺失，观测保持关闭'
}

function Disable-Observability {
    $env:TOOLBOX_OBSERVABILITY_ENABLED = 'false'
    foreach ($name in @(
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
        'OTEL_EXPORTER_OTLP_HEADERS',
        'LANGFUSE_BASE_URL',
        'LANGFUSE_PUBLIC_KEY',
        'LANGFUSE_SECRET_KEY'
    )) { Remove-ProcessEnvironmentVariable $name }
    Write-Host '[supervisor] OpenTelemetry 观测已关闭'
}

switch ($Observability) {
    'aspire' { Initialize-AspireObservability }
    'langfuse' { Initialize-LangfuseObservability }
    'off' { Disable-Observability }
}

# 工具路径解析：优先 run-tools.conf 注入的 MVN_CMD/JAVA_CMD（上面已读入环境变量），其次 PATH，最后已知回退。
# 接受目录值——自动定位到 bin\mvn.cmd / bin\java.exe（用户填了 Maven/JDK 主目录也能用）。
function Resolve-ExePath([string]$path, [string]$name) {
    if (-not $path) { return $null }
    if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    if (Test-Path -LiteralPath $path -PathType Container) {
        foreach ($d in @($path, (Join-Path $path 'bin'))) {
            foreach ($ext in @('.cmd', '.bat', '.exe', '')) {
                $cand = Join-Path $d ($name + $ext)
                if (Test-Path -LiteralPath $cand -PathType Leaf) { return $cand }
            }
        }
    }
    return $null
}
function Resolve-Tool([string]$envVal, [string]$onPath, [string[]]$fallbacks) {
    $r = Resolve-ExePath $envVal $onPath
    if ($r) { return $r }
    $c = Get-Command $onPath -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in $fallbacks) { $r = Resolve-ExePath $p $onPath; if ($r) { return $r } }
    return $null
}

function Test-Java21([string]$command) {
    try {
        $versionOutput = (& $command -version 2>&1 | Out-String)
        return $LASTEXITCODE -eq 0 -and $versionOutput -match 'version\s+"21(?:[.\-+]|\")'
    } catch {
        return $false
    }
}

function Resolve-RequiredTool(
    [string]$envName,
    [string]$displayName,
    [string]$commandName,
    [string[]]$fallbacks,
    [scriptblock]$validator = $null,
    [string]$validationHint = ''
) {
    $configuredPath = [Environment]::GetEnvironmentVariable($envName, 'Process')
    $resolvedPath = Resolve-Tool $configuredPath $commandName $fallbacks

    while (-not $resolvedPath -or ($validator -and -not (& $validator $resolvedPath))) {
        if ($resolvedPath) {
            Write-Host "[supervisor] $displayName 校验失败：$resolvedPath$validationHint"
        } else {
            Write-Host "[supervisor] 未找到 $displayName，启动已暂停。"
        }

        $inputPath = (Read-Host "[supervisor] 请输入 $displayName 可执行文件或安装目录路径").Trim().Trim('"').Trim("'")
        $resolvedPath = Resolve-ExePath $inputPath $commandName
        if (-not $resolvedPath) {
            Write-Host "[supervisor] 路径无效或其中未找到 $commandName，请重新输入。"
        }
    }

    [Environment]::SetEnvironmentVariable($envName, $resolvedPath, 'Process')
    Write-Host "[supervisor] $displayName=$resolvedPath"
    return $resolvedPath
}

$MvnCmd = Resolve-RequiredTool 'MVN_CMD' 'Maven' 'mvn' @(
    'D:\devApps\apache-maven-3.9.16-bin\apache-maven-3.9.16\bin\mvn.cmd',
    'C:\Program Files\apache-maven\bin\mvn.cmd'
)

# Java：构建(mvn)和运行(java -jar)都必须用 JDK 21，否则 jar 是 17+ 字节码、PATH 上的旧 JDK 跑不了。
$JavaCmd = Resolve-RequiredTool 'JAVA_CMD' 'Java（JDK 21）' 'java' @(
    $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { $null })
) ${function:Test-Java21} '（必须为 JDK 21）'
# 据 JavaCmd 反推并覆盖 JAVA_HOME，供 mvn 构建用对 JDK（本机默认 JAVA_HOME 可能是旧 JDK）。
if ($JavaCmd -match '[\\/]bin[\\/]java(\.exe)?$') {
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $JavaCmd)
    Write-Host "[supervisor] JAVA_HOME=$env:JAVA_HOME"
}
# Playwright/patchright 浏览器内核下载走国内镜像（官方 CDN 境内常被掐 TLS）。
if (-not $env:PLAYWRIGHT_DOWNLOAD_HOST) { $env:PLAYWRIGHT_DOWNLOAD_HOST = 'https://cdn.npmmirror.com/binaries/playwright' }
# npm install 走国内镜像（sidecar 依赖直连 registry.npmjs.org 境内常超时/失败）。已自定义则不覆盖。
if (-not $env:NPM_CONFIG_REGISTRY) { $env:NPM_CONFIG_REGISTRY = 'https://registry.npmmirror.com' }

# 前端 Vite dev 端口（须与 frontend/vite.config.ts 一致）。
$FrontendPort = 5173

# whisper 后端模式，来自 run-tools.conf 的 TOOLBOX_WHISPER_MODE，缺省 cli（同 application.yml）。
#   cli         —— whisper-cli.exe 子进程，需要 binary + model 就位，不占常驻显存
#   asr-service —— faster-whisper Python 服务(:9500)，绕开 CJK 路径/参数兼容坑，模型常驻显存更快
# 字幕与语言识别两种模式都支持；不可用时前端按 capability 端点禁用按钮并显示原因。
# 曾经这里硬编码 asr-service，覆盖了 yml 的 cli 又从不拉起 :9500 服务，结果字幕/语言识别双双废掉。
# 教训：运行模式与它依赖的 sidecar 必须由同一处决定 —— 见下面 Start-FasterWhisperSidecar。
$WhisperMode = if ($env:TOOLBOX_WHISPER_MODE) { $env:TOOLBOX_WHISPER_MODE.Trim().ToLower() } else { 'cli' }
if ($WhisperMode -notin @('cli', 'asr-service')) {
    Write-Host "[supervisor] WARN: TOOLBOX_WHISPER_MODE='$WhisperMode' 非法（只支持 cli / asr-service），回退 cli"
    $WhisperMode = 'cli'
}

# faster-whisper ASR 服务端口，须与 application.yml 的 toolbox.whisper.service-url 一致。
$AsrPort = 9500

# npm：前端 dev 与两个 node sidecar 初始化都要它。优先 conf 注入的 NPM_CMD，其次 PATH；
# 把其所在目录前置进 PATH，确保 spawn 出去的子 powershell 也能直接调 npm。
$NpmCmd = Resolve-RequiredTool 'NPM_CMD' 'npm' 'npm' @(
    'D:\Program Files\nodejs\npm.cmd',
    'C:\Program Files\nodejs\npm.cmd'
)
$npmDir = Split-Path -Parent $NpmCmd
if ($npmDir -and (";$env:PATH;" -notlike "*;$npmDir;*")) { $env:PATH = "$npmDir;$env:PATH" }
if ([string]::IsNullOrWhiteSpace($env:GIT_CMD)) {
    $gitForJava = Get-Command git -ErrorAction SilentlyContinue
    if ($gitForJava) { $env:GIT_CMD = $gitForJava.Source }
}

# /restart 控制端点的令牌，取自 run-tools.conf 的 TOOLBOX_SUPERVISOR_RESTART_TOKEN。
# 公开仓库禁止硬编码；未配置时令牌为空，/restart 一律拒绝。
$RestartToken = $env:TOOLBOX_SUPERVISOR_RESTART_TOKEN
$SystemRestartToken = $env:TOOLBOX_SYSTEM_RESTART_TOKEN

# /reload is also called by the child Java auto-updater. Generate an ephemeral
# 256-bit token for this worker and expose it only through the inherited process
# environment; never print it or persist it in status files.
$internalControlTokenBytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($internalControlTokenBytes)
$script:InternalControlToken = [Convert]::ToHexString($internalControlTokenBytes).ToLowerInvariant()
$env:KAI_SUPERVISOR_CONTROL_TOKEN = $script:InternalControlToken
$env:KAI_SUPERVISOR_PROTOCOL_VERSION = '1'

$HttpPrefix = 'http://127.0.0.1:18081/'

# Backend port. Must match server.port in application.yml.
$BackendPort = 18080

# claude-agent node sidecar 端口，须与 application.yml 的 toolbox.claude-chat.sidecar-port 一致。
# 后端懒启动 node dist/server.js 绑此端口；重启时必须一并清掉，否则旧 sidecar 变孤儿占端口、
# 新 sidecar 命中 EADDRINUSE 退出，后端连回旧代码，导致 sidecar 侧改动重启后不生效。
$SidecarPort = 18890

# undetected-browser sidecar may outlive the backend process; a full reload must not
# let the next generation reconnect to stale code.
$BrowserServicePort = 18092

# Marks backend children as supervisor-owned so SupervisorBootstrap avoids loops.
$env:KAI_SUPERVISED = '1'

$script:backend = $null
$script:frontend = $null
$script:lastStart = $null
$script:hotReloadWatchers = @()
$script:hotReloadRegistrations = @()
$script:hotCompile = $null
$script:hotReloadDue = $null
$script:hotReloadFullRestart = $false
$script:autoUpdateState = if ($script:JavaAutoUpdateEnabled) { 'delegated-to-java' } else { 'disabled' }
$script:autoUpdateLastCheck = $null
$script:autoUpdateNextCheck = $null
$script:autoUpdateCandidateSha = $null
$script:autoUpdateCandidateSince = $null
$script:autoUpdateLocalHead = $null
$script:autoUpdateRemoteHead = $null
$script:autoUpdateLastError = $null
$script:autoUpdateFetchFailures = 0
$script:autoUpdateLastLogKey = $null
$script:autoUpdateRelaunchRequested = $false
$script:autoUpdateLogFile = Join-Path (
    if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() }
) 'kai-toolbox\logs\auto-update.log'
$script:GitCmd = if ($script:AutoUpdateEnabled) {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCommand) { $gitCommand.Source } else { $null }
} else { $null }

if ($script:AutoUpdateEnabled -and (-not $script:GitCmd)) {
    $script:AutoUpdateEnabled = $false
    $script:autoUpdateState = 'disabled'
    $script:autoUpdateLastError = 'git executable not found'
    Write-Host '[auto-update] git 未找到，自动更新已关闭'
}
if ($script:AutoUpdateEnabled -and (
        $script:AutoUpdateRemote -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$' -or
        $script:AutoUpdateBranch -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$' -or
        $script:AutoUpdateRemote.Contains('..') -or $script:AutoUpdateBranch.Contains('..'))) {
    $script:AutoUpdateEnabled = $false
    $script:autoUpdateState = 'disabled'
    $script:autoUpdateLastError = 'invalid remote or branch configuration'
    Write-Host '[auto-update] remote/branch 配置不合法，自动更新已关闭'
}

$HotReloadEventPrefix = 'kai-toolbox-hot-reload'
$HotReloadDebounceMs = 800

# Stops all process trees that listen on the target port.
function Stop-PortHolders([int]$port) {
    $pids = @()
    try {
        $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
                Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        # Fall back to netstat when Get-NetTCPConnection is unavailable.
        foreach ($l in (netstat -ano | Select-String ":$port\s.*LISTENING")) {
            $tok = ($l.ToString().Trim() -split '\s+')[-1]
            if ($tok -match '^\d+$') { $pids += [int]$tok }
        }
    }
    foreach ($procId in ($pids | Where-Object { $_ -and $_ -ne 0 } | Select-Object -Unique)) {
        Write-Host "[supervisor] takeover: stop process on :$port PID=$procId"
        & taskkill /PID $procId /T /F 2>&1 | Out-Null
    }
}

function Quote-PowerShellLiteral([string]$value) {
    return "'" + $value.Replace("'", "''") + "'"
}

function Resolve-PowerShellExe {
    $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    if ($currentProcessPath -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }

    foreach ($candidate in @(
        (Join-Path $PSHOME 'pwsh.exe'),
        (Join-Path $PSHOME 'powershell.exe')
    )) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    foreach ($commandName in @('pwsh', 'powershell')) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    throw 'No PowerShell executable found for backend child process.'
}

function Start-Backend {
    Stop-PortHolders $BackendPort
    # 一并清掉上一代 node claude-agent sidecar：它是后端懒启动的子进程，java 先退时会被重挂养成孤儿、
    # 逃过 tree-kill 继续占 18890；不清掉的话新后端懒启动的新 sidecar 会 EADDRINUSE 退出、连回旧代码。
    Stop-PortHolders $SidecarPort
    # 旧 sidecar 已杀、新的还没起，趁这个空档把 dist 校验到最新：下面 mvn 会重编译 Java，
    # 但 sidecar 是独立的 TS 产物，不在这儿构建就只有 Java 侧生效。源码没动时只比一次时间戳，开销可忽略。
    Ensure-ClaudeAgentBuild
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') start backend (mode=$Mode)..."
    $starterJar = Join-Path $RepoRoot 'toolbox-starter\target\kai-toolbox.jar'
    # 机密项一律取自 run-tools.conf（已注入环境变量），禁止硬编码进脚本（本仓为公开仓库）。
    #   TOOLBOX_QBT_PASSWORD            qBittorrent 密码
    #   TOOLBOX_SYSTEM_RESTART_TOKEN    后端系统级重启令牌
    #   TOOLBOX_QDRANT_HOST / _API_KEY  AI 秘书 RAG 的 Qdrant 地址与 Key（未设 Key 则不启用 RAG）
    $javaOptions = @(
        '-DTOOLBOX_ARIA2_BINARY=D:\devapps\aria2-1.37.0-win-64bit-build1\aria2c.exe',
        '-DTOOLBOX_HTTP_PROXY=http://127.0.0.1:7897',
        '-Dfile.encoding=UTF-8',
        '-Dstdout.encoding=UTF-8',
        '-Dstderr.encoding=UTF-8',
        "-Dtoolbox.whisper.mode=$WhisperMode"
    )
    if ($env:TOOLBOX_QBT_PASSWORD)         { $javaOptions += "-DTOOLBOX_QBT_PASSWORD=$env:TOOLBOX_QBT_PASSWORD" }
    if ($env:TOOLBOX_SYSTEM_RESTART_TOKEN) { $javaOptions += "-DTOOLBOX_SYSTEM_RESTART_TOKEN=$env:TOOLBOX_SYSTEM_RESTART_TOKEN" }
    # AI 秘书向量 RAG：远端 Qdrant + API Key（嵌入仍用本地 Ollama bge-m3，需先 ollama pull bge-m3）
    if ($env:TOOLBOX_QDRANT_API_KEY) {
        $qdrantHost = if ($env:TOOLBOX_QDRANT_HOST) { $env:TOOLBOX_QDRANT_HOST } else { '127.0.0.1' }
        $javaOptions += '-Dtoolbox.ai-secretary.rag.enabled=true'
        $javaOptions += "-Dtoolbox.ai-secretary.rag.qdrant-host=$qdrantHost"
        $javaOptions += '-Dtoolbox.ai-secretary.rag.qdrant-port=6334'
        $javaOptions += "-Dtoolbox.ai-secretary.rag.qdrant-api-key=$env:TOOLBOX_QDRANT_API_KEY"
        # 访客分析向量 RAG：同一套远端 Qdrant + Key（独立集合 va_customers），用于灰区判别的相似客户召回。
        $javaOptions += '-Dtoolbox.visitor-analysis.rag.enabled=true'
        $javaOptions += "-Dtoolbox.visitor-analysis.rag.qdrant-host=$qdrantHost"
        $javaOptions += '-Dtoolbox.visitor-analysis.rag.qdrant-port=6334'
        $javaOptions += "-Dtoolbox.visitor-analysis.rag.qdrant-api-key=$env:TOOLBOX_QDRANT_API_KEY"
    }
    # SQLite DB 文件位置。留空走默认 ${toolbox.data-dir}/toolbox.db；
    # C 盘吃紧时在 run-tools.conf 配 TOOLBOX_SQLITE_FILE 把 DB 单独放大盘（如 D:\kai-toolbox\toolbox.db）。
    if ($env:TOOLBOX_SQLITE_FILE) { $javaOptions += "-Dtoolbox.sqlite.file=$env:TOOLBOX_SQLITE_FILE" }
    # DevTools 热重启在 application.yml 里默认关（改完由人发 POST /restart）；-HotReload 时才用
    # 系统属性顶回来——系统属性优先级高于 application.yml，一个开关同时管住监听与重启两端。
    if ($HotReload) { $javaOptions += '-Dspring.devtools.restart.enabled=true' }
    $mvnLiteral = Quote-PowerShellLiteral $MvnCmd
    $javaLiteral = Quote-PowerShellLiteral $JavaCmd
    $javaOptionsLiteral = ($javaOptions | ForEach-Object { Quote-PowerShellLiteral $_ }) -join ' '
    $jarLiteral = Quote-PowerShellLiteral $starterJar
    $utf8Command = "chcp.com 65001 > `$null; `$utf8Encoding = [System.Text.UTF8Encoding]::new(`$false); [Console]::InputEncoding = `$utf8Encoding; [Console]::OutputEncoding = `$utf8Encoding; `$global:OutputEncoding = `$utf8Encoding"
    if ($Mode -eq 'full') {
        $runCommand = "$utf8Command; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' package; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; & $javaLiteral $javaOptionsLiteral -jar $jarLiteral"
    } else {
        $jvmArgumentsProperty = Quote-PowerShellLiteral ("-Dspring-boot.run.jvmArguments=" + ($javaOptions -join ' '))
        $runCommand = "$utf8Command; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' spring-boot:run $jvmArgumentsProperty"
    }
    $powerShellExe = Resolve-PowerShellExe
    $script:backend = Start-Process -FilePath $powerShellExe `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $runCommand) `
        -PassThru -NoNewWindow
    $script:lastStart = Get-Date
}

function Stop-Backend {
    if ($script:backend -and -not $script:backend.HasExited) {
        # Prefer Spring's shutdown hook so in-flight transports and sidecars can close cleanly.
        # The Maven wrapper may still outlive the JVM, so a bounded force-kill remains the fallback.
        if (-not [string]::IsNullOrWhiteSpace($SystemRestartToken)) {
            try {
                Invoke-WebRequest -UseBasicParsing -Method Post `
                    -Uri "http://127.0.0.1:$BackendPort/api/system/restart" `
                    -Headers @{ 'X-Restart-Token' = $SystemRestartToken } `
                    -TimeoutSec 3 | Out-Null
                if ($script:backend.WaitForExit(10000)) { return }
                Write-Host '[supervisor] 后端优雅退出超时，回退到进程树清理'
            } catch {
                # Backend may still be compiling or already unavailable; force cleanup below.
            }
        }
        # mvn spawns java children, so the whole process tree must be stopped.
        & taskkill /PID $script:backend.Id /T /F 2>&1 | Out-Null
    }
}

function Start-HotReloadWatcher {
    if ($Mode -ne 'dev') { return }
    if (-not $HotReload) {
        Write-Host '[supervisor] hot reload 关闭（默认）：改完代码自己发 POST /restart，或加 -HotReload 开启'
        return
    }

    $sourceRoots = Get-ChildItem -LiteralPath $RepoRoot -Filter 'pom.xml' -File -Recurse `
            -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.DirectoryName 'src\main' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Container } |
        Select-Object -Unique
    $watchSpecs = @($sourceRoots | ForEach-Object {
        [pscustomobject]@{ Path = $_; Filter = '*.*'; Recursive = $true }
    })
    $watchSpecs += [pscustomobject]@{ Path = $RepoRoot; Filter = 'pom.xml'; Recursive = $true }

    $watcherIndex = 0
    foreach ($spec in $watchSpecs) {
        $watcher = [System.IO.FileSystemWatcher]::new($spec.Path, $spec.Filter)
        $watcher.IncludeSubdirectories = $spec.Recursive
        $watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName `
            -bor [System.IO.NotifyFilters]::DirectoryName `
            -bor [System.IO.NotifyFilters]::LastWrite
        $watcher.EnableRaisingEvents = $true
        $script:hotReloadWatchers += $watcher
        foreach ($eventName in @('Changed', 'Created', 'Deleted', 'Renamed')) {
            $sourceIdentifier = "$HotReloadEventPrefix-$watcherIndex-$eventName"
            $script:hotReloadRegistrations += Register-ObjectEvent `
                -InputObject $watcher `
                -EventName $eventName `
                -SourceIdentifier $sourceIdentifier
        }
        $watcherIndex++
    }
    Write-Host "[supervisor] hot reload enabled: $($sourceRoots.Count) source roots -> compile -> DevTools restart"
}

function Stop-HotReloadWatcher {
    foreach ($registration in $script:hotReloadRegistrations) {
        Unregister-Event -SubscriptionId $registration.Id -ErrorAction SilentlyContinue
    }
    Get-Event | Where-Object SourceIdentifier -Like "$HotReloadEventPrefix-*" |
        Remove-Event -ErrorAction SilentlyContinue
    $script:hotReloadRegistrations = @()
    foreach ($watcher in $script:hotReloadWatchers) {
        $watcher.Dispose()
    }
    $script:hotReloadWatchers = @()
    if ($script:hotCompile -and -not $script:hotCompile.HasExited) {
        & taskkill /PID $script:hotCompile.Id /T /F 2>&1 | Out-Null
    }
}

function Test-HotReloadPath([string]$path) {
    if (-not $path) { return $false }
    $normalized = $path.Replace('/', '\')
    if ([System.IO.Path]::GetFileName($normalized) -eq 'pom.xml') { return $true }
    return $normalized -match '\\src\\main\\(?:java|resources)\\'
}

function Receive-HotReloadEvents {
    $matched = $false
    foreach ($event in @(Get-Event | Where-Object SourceIdentifier -Like "$HotReloadEventPrefix-*")) {
        $path = $event.SourceEventArgs.FullPath
        if (Test-HotReloadPath $path) {
            $matched = $true
            if ([System.IO.Path]::GetFileName($path) -eq 'pom.xml') {
                $script:hotReloadFullRestart = $true
            }
        }
        Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
    }
    if ($matched) {
        $script:hotReloadDue = (Get-Date).AddMilliseconds($HotReloadDebounceMs)
    }
}

function Start-HotCompile {
    $mvnLiteral = Quote-PowerShellLiteral $MvnCmd
    $repoLiteral = Quote-PowerShellLiteral $RepoRoot
    $command = "Set-Location -LiteralPath $repoLiteral; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' compile"
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') source changed, incremental compile..."
    $script:hotCompile = Start-Process -FilePath (Resolve-PowerShellExe) `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
        -PassThru -NoNewWindow
    $script:hotReloadDue = $null
}

function Update-HotReload {
    if ($Mode -ne 'dev' -or -not $HotReload) { return }
    Receive-HotReloadEvents

    if ($script:hotCompile) {
        if (-not $script:hotCompile.HasExited) { return }
        if ($script:hotCompile.ExitCode -eq 0) {
            Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') compile succeeded; waiting for DevTools restart"
        } else {
            Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') compile failed; old backend remains active"
        }
        $script:hotCompile = $null
    }

    if (-not $script:hotReloadDue -or (Get-Date) -lt $script:hotReloadDue) { return }
    if ($script:hotReloadFullRestart) {
        Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') pom.xml changed, restart backend process"
        $script:hotReloadFullRestart = $false
        $script:hotReloadDue = $null
        Stop-Backend
        return
    }
    Start-HotCompile
}

# 取一组路径下最新的文件修改时间（目录递归）。用于判断源码是否比构建产物新。缺失路径跳过。
function Get-LatestWriteTime([string[]]$paths) {
    $latest = [datetime]::MinValue
    foreach ($p in $paths) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        if (Test-Path -LiteralPath $p -PathType Container) {
            foreach ($it in (Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue)) {
                if ($it.LastWriteTimeUtc -gt $latest) { $latest = $it.LastWriteTimeUtc }
            }
        } else {
            $it = Get-Item -LiteralPath $p -ErrorAction SilentlyContinue
            if ($it -and $it.LastWriteTimeUtc -gt $latest) { $latest = $it.LastWriteTimeUtc }
        }
    }
    return $latest
}

# claude-agent sidecar（claude-chat 懒启动 node dist/server.js）的依赖/构建就位，幂等，已最新则跳过。
#
# 单独成函数是为了让 Start-Backend 也能调。后端每次重启都会 Stop-PortHolders 掉旧 sidecar、再由新
# 后端懒启动一个，而它加载的是 dist/server.js。若只在 supervisor 首启时构建一次，「改 sidecar 源码
# → 点 UI 重启」这条最常用的路径就永远加载旧 dist：mvn 把 Java 重编译了，sidecar 还是旧的，两边
# 版本对不上。更糟的是它不报错——server.ts 对不认识的消息类型只走 default 打一行 warn 就丢掉，
# 表现为功能静默失效，很难往「sidecar 没重新编译」上想。
function Ensure-ClaudeAgentBuild {
    if (-not $NpmCmd) { Write-Host '[supervisor] 跳过 claude-agent 构建（npm 未找到）'; return }
    # 不只判断「dist 是否存在」，还要判断「src 是否比 dist 新」——否则改了 sidecar 源码后
    # 因旧 dist 还在被「已构建，跳过」，后端仍加载旧代码，每次都得手动 npm run build（开发期老坑）。
    $sidecar = Join-Path $RepoRoot 'sidecar\claude-agent'
    $distServer = Join-Path $sidecar 'dist\server.js'
    $nodeModules = Join-Path $sidecar 'node_modules'
    $pkgJson = Join-Path $sidecar 'package.json'
    $pkgLock = Join-Path $sidecar 'package-lock.json'
    $installedLock = Join-Path $nodeModules '.package-lock.json'
    # 依赖：package.json 与 lockfile 都要参与；node_modules 目录本身的 mtime 不能证明 lock 已落地。
    $installedTime = if (Test-Path -LiteralPath $installedLock) {
        (Get-Item -LiteralPath $installedLock).LastWriteTimeUtc
    } else { [datetime]::MinValue }
    $dependencyTime = Get-LatestWriteTime @($pkgJson, $pkgLock)
    $needInstall = (-not (Test-Path -LiteralPath $nodeModules)) -or
        (-not (Test-Path -LiteralPath $installedLock)) -or ($dependencyTime -gt $installedTime)
    # 构建：dist/server.js 缺失、或 src/tsconfig/package.json 比 dist 新就重建。
    $srcNewest = Get-LatestWriteTime @((Join-Path $sidecar 'src'), $pkgJson, (Join-Path $sidecar 'tsconfig.json'))
    $distTime = if (Test-Path -LiteralPath $distServer) { (Get-Item -LiteralPath $distServer).LastWriteTimeUtc } else { [datetime]::MinValue }
    $needBuild = (-not (Test-Path -LiteralPath $distServer)) -or ($srcNewest -gt $distTime)
    if ($needInstall -or $needBuild) {
        $reason = if (-not (Test-Path -LiteralPath $distServer)) { 'dist/server.js 缺失' } elseif ($needBuild) { '源码比 dist 新' } else { '依赖变更' }
        Write-Host "[supervisor] init claude-agent sidecar ($reason)..."
        Push-Location $sidecar
        try {
            if ($needInstall) {
                if (Test-Path -LiteralPath $pkgLock) { & $NpmCmd ci --no-audit --no-fund }
                else { & $NpmCmd install --no-audit --no-fund }
                if ($LASTEXITCODE -ne 0) {
                    Write-Host '[supervisor] WARN: claude-agent 依赖安装失败；保留现有服务重试'
                    return
                }
            }
            if ($needBuild -or $needInstall) {
                & $NpmCmd run build
                if ($LASTEXITCODE -ne 0) { Write-Host '[supervisor] WARN: claude-agent build 失败；claude-chat 可能起不来' }
            }
        } catch { Write-Host "[supervisor] WARN: claude-agent init 出错: $($_.Exception.Message)" } finally { Pop-Location }
    } else { Write-Host '[supervisor] claude-agent sidecar dist 最新，跳过' }
}

# 一次性、幂等初始化 node sidecar 依赖（后端按需 spawn，这里只保证依赖/构建就位，已就绪则跳过）。
# claude-agent 的构建同时也挂在 Start-Backend 上（每次重启都校验一遍），这里只是首启先跑一次。
function Initialize-NodeDeps {
    if (-not $NpmCmd) { Write-Host '[supervisor] 跳过 sidecar 初始化（npm 未找到）'; return }
    Ensure-ClaudeAgentBuild
    # undetected-browser（browser-request 的 undetected-node 引擎）：需 node_modules(patchright) + chromium。
    $undetected = Join-Path $RepoRoot 'node-services\undetected-browser'
    $undetectedNodeModules = Join-Path $undetected 'node_modules'
    $undetectedLock = Join-Path $undetected 'package-lock.json'
    $undetectedInstalledLock = Join-Path $undetectedNodeModules '.package-lock.json'
    $undetectedInstalledTime = if (Test-Path -LiteralPath $undetectedInstalledLock) {
        (Get-Item -LiteralPath $undetectedInstalledLock).LastWriteTimeUtc
    } else { [datetime]::MinValue }
    $undetectedDependencyTime = Get-LatestWriteTime @(
        (Join-Path $undetected 'package.json'), $undetectedLock)
    $undetectedNeedsInstall = (-not (Test-Path -LiteralPath $undetectedNodeModules)) -or
        (-not (Test-Path -LiteralPath $undetectedInstalledLock)) -or
        ($undetectedDependencyTime -gt $undetectedInstalledTime)
    if ($undetectedNeedsInstall) {
        Write-Host '[supervisor] init/update undetected-browser dependencies + chromium...'
        Push-Location $undetected
        try {
            if (Test-Path -LiteralPath $undetectedLock) { & $NpmCmd ci --no-audit --no-fund }
            else { & $NpmCmd install --no-audit --no-fund }
            if ($LASTEXITCODE -eq 0) {
                & $NpmCmd run install-browser
                if ($LASTEXITCODE -ne 0) { Write-Host '[supervisor] WARN: chromium 安装失败；undetected-node 引擎不可用' }
            } else { Write-Host '[supervisor] WARN: undetected-browser npm install 失败' }
        } catch { Write-Host "[supervisor] WARN: undetected-browser init 出错: $($_.Exception.Message)" } finally { Pop-Location }
    } else { Write-Host '[supervisor] undetected-browser 依赖与 lockfile 一致，跳过' }
}

# 微信监控 sidecar（python-services\wechat，wxauto）。完全隔离、尽力而为：
#   - Start-Process 异步起独立进程/窗口：首次建 venv/pip install 可能数分钟，绝不阻塞 supervisor；
#   - 整段 try/catch：起不来只打 WARN，绝不影响 backend / frontend / 其它 sidecar；
#   - 不纳入下面的守护重启循环：它挂了就挂了，后端 WechatMonitorService 有退避兜底；
#   - 前置条件是「微信已登录」，这里无法判断，交给 sidecar 自己（/health 会报 wechat_online=false）。
function Start-WechatSidecar {
    try {
        $wechatDir = Join-Path $RepoRoot 'python-services\wechat'
        $bat = Join-Path $wechatDir 'start.bat'
        if (-not (Test-Path -LiteralPath $bat)) { Write-Host '[supervisor] wechat sidecar start.bat 不存在，跳过'; return }
        # 已在 :9700 监听则不重复拉起（避免重启 supervisor 时起第二个）。
        $listening = $false
        try { $listening = [bool](Get-NetTCPConnection -LocalPort 9700 -State Listen -ErrorAction Stop) } catch { }
        if ($listening) { Write-Host '[supervisor] wechat sidecar 已在 :9700，跳过'; return }
        Write-Host '[supervisor] start wechat sidecar (python-services\wechat\start.bat，独立窗口，首次装依赖较慢)...'
        Start-Process -FilePath $bat -WorkingDirectory $wechatDir -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: wechat sidecar 启动失败（不影响其它作业）: $($_.Exception.Message)"
    }
}

# faster-whisper ASR sidecar（python-services\faster-whisper，:9500）。隔离、尽力而为，同 wechat。
# 只在 $WhisperMode -eq 'asr-service' 时拉起 —— 模式决定要不要这个进程，两者同一处判断，
# 不会再出现「模式钉在 asr-service 却没人起 :9500」的空挡。cli 模式下起它纯属白占显存。
function Start-FasterWhisperSidecar {
    try {
        if ($WhisperMode -ne 'asr-service') {
            Write-Host "[supervisor] whisper mode=$WhisperMode，不需要 ASR sidecar(:$AsrPort)，跳过"
            return
        }
        $asrDir = Join-Path $RepoRoot 'python-services\faster-whisper'
        $bat = Join-Path $asrDir 'start.bat'
        if (-not (Test-Path -LiteralPath $bat)) {
            Write-Host '[supervisor] WARN: faster-whisper start.bat 不存在，asr-service 模式下字幕将不可用'
            return
        }
        $listening = $false
        try { $listening = [bool](Get-NetTCPConnection -LocalPort $AsrPort -State Listen -ErrorAction Stop) } catch { }
        if ($listening) { Write-Host "[supervisor] faster-whisper sidecar 已在 :$AsrPort，跳过"; return }
        Write-Host "[supervisor] start faster-whisper sidecar (:$AsrPort，独立窗口，首次装依赖 + 下模型较慢)..."
        Start-Process -FilePath $bat -WorkingDirectory $asrDir -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: faster-whisper sidecar 启动失败（不影响其它作业）: $($_.Exception.Message)"
    }
}

# 访客分析 AgentScope sidecar（python-services\visitor-analysis）。隔离、尽力而为，同 wechat：
#   - 独立窗口异步起，首次建 .venv/pip install 较慢，绝不阻塞 supervisor；
#   - 整段 try/catch：起不来只 WARN，不连累 backend / frontend / 其它 sidecar；不进守护循环；
#   - 需 VA_LLM_API_KEY（未设则灰区分类返回 UNKNOWN，后端标「待人工确认」）；端口 9600。
function Start-VisitorAnalysisSidecar {
    try {
        $vaDir = Join-Path $RepoRoot 'python-services\visitor-analysis'
        $bat = Join-Path $vaDir 'start.bat'
        if (-not (Test-Path -LiteralPath $bat)) { Write-Host '[supervisor] visitor-analysis sidecar start.bat 不存在，跳过'; return }
        $listening = $false
        try { $listening = [bool](Get-NetTCPConnection -LocalPort 9600 -State Listen -ErrorAction Stop) } catch { }
        if ($listening) { Write-Host '[supervisor] visitor-analysis sidecar 已在 :9600，跳过'; return }
        Write-Host '[supervisor] start visitor-analysis sidecar (python-services\visitor-analysis\start.bat，独立窗口，首次装依赖较慢)...'
        Start-Process -FilePath $bat -WorkingDirectory $vaDir -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: visitor-analysis sidecar 启动失败（不影响其它作业）: $($_.Exception.Message)"
    }
}

# 显式重启（/restart）时回收两个 Python sidecar，让其吃到新代码/新配置。
# 必须先停端口持有者：Start-* 自带「端口已监听即跳过」的幂等保护，不先停就只会被 skip、旧进程长存。
# 停后留一小段时间让监听端口释放，避免 Start-* 误判「已在监听」而跳过。
function Restart-PythonSidecars {
    $asrNote = if ($WhisperMode -eq 'asr-service') { " + faster-whisper(:$AsrPort)" } else { '' }
    Write-Host "[supervisor] 回收 Python sidecar：visitor-analysis(:9600) + wechat(:9700)$asrNote"
    Stop-PortHolders 9600
    Stop-PortHolders 9700
    if ($WhisperMode -eq 'asr-service') { Stop-PortHolders $AsrPort }
    Start-Sleep -Milliseconds 800
    Start-VisitorAnalysisSidecar
    Start-WechatSidecar
    Start-FasterWhisperSidecar
}

# 返回 :$port 上监听进程的 pid / 名字 / 命令行（无人监听则 Occupied=$false）。
# 「端口被占」不等于「我要的那个服务在跑」——要跳过启动，得先凭命令行认出占用者是谁。
function Get-PortHolder([int]$port) {
    $holderPid = $null
    try {
        $holderPid = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique | Select-Object -First 1
    } catch {
        foreach ($l in (netstat -ano | Select-String ":$port\s.*LISTENING")) {
            $tok = ($l.ToString().Trim() -split '\s+')[-1]
            if ($tok -match '^\d+$') { $holderPid = [int]$tok; break }
        }
    }
    if (-not $holderPid) {
        return [pscustomobject]@{ Occupied = $false; ProcessId = $null; Name = $null; CommandLine = $null }
    }
    $name = $null
    $commandLine = $null
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$holderPid" -ErrorAction Stop
        $name = $proc.Name
        $commandLine = $proc.CommandLine
    } catch {
        # 拿不到进程详情（权限/进程刚退）：只回 pid，调用方按「认不出」处理
    }
    return [pscustomobject]@{ Occupied = $true; ProcessId = $holderPid; Name = $name; CommandLine = $commandLine }
}

function Start-AgentScopeStudio {
    try {
        # 3000 是烂大街的端口（别的 dev server / 面板都可能占）。只按「端口有人监听」就跳过，
        # 会在被别人占用时静默不启动，日志还写着一句让人放心的「已在 :3000」——认人再决定。
        $holder = Get-PortHolder 3000
        if ($holder.Occupied) {
            if ("$($holder.CommandLine)" -match 'as_studio|agentscope') {
                Write-Host '[supervisor] AgentScope Studio 已在 :3000，跳过'
            } else {
                Write-Host "[supervisor] WARN: :3000 被非 Studio 进程占用（PID=$($holder.ProcessId) $($holder.Name)），本次不启动 Studio；要腾端口可跑 stop-supervised.ps1 -Ports 3000"
            }
            return
        }
        if (-not $NpmCmd) { Write-Host '[supervisor] npm 未找到，跳过 AgentScope Studio (:3000)'; return }

        $installThenRun = -not [bool](Get-Command as_studio -ErrorAction SilentlyContinue)
        $runCommand = if ($installThenRun) {
            "npm install -g @agentscope/studio; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; as_studio"
        } else {
            "as_studio"
        }
        Write-Host '[supervisor] start AgentScope Studio (:3000，独立进程，首次安装较慢)...'
        Start-Process -FilePath (Resolve-PowerShellExe) `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $runCommand) `
            -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: AgentScope Studio 启动失败（不影响其它作业）: $($_.Exception.Message)"
    }
}

function Start-Frontend {
    if (-not $NpmCmd) { Write-Host '[supervisor] 跳过前端启动（npm 未找到）'; return }
    $frontendDir = Join-Path $RepoRoot 'frontend'
    $nodeModules = Join-Path $frontendDir 'node_modules'
    $installedLock = Join-Path $nodeModules '.package-lock.json'
    $packageFiles = @(
        (Join-Path $frontendDir 'package.json'),
        (Join-Path $frontendDir 'package-lock.json')
    )
    $installedTime = if (Test-Path -LiteralPath $installedLock) {
        (Get-Item -LiteralPath $installedLock).LastWriteTimeUtc
    } else {
        [datetime]::MinValue
    }
    $dependencyTime = Get-LatestWriteTime $packageFiles
    $needInstall = (-not (Test-Path -LiteralPath $nodeModules)) -or
        (-not (Test-Path -LiteralPath $installedLock)) -or
        ($dependencyTime -gt $installedTime)

    if ($needInstall) {
        Write-Host '[supervisor] frontend 依赖缺失或 lockfile 已变更，按 lockfile 同步依赖...'
        Push-Location $frontendDir
        try {
            $frontendLock = Join-Path $frontendDir 'package-lock.json'
            if (Test-Path -LiteralPath $frontendLock) { & $NpmCmd ci --no-audit --no-fund }
            else { & $NpmCmd install --no-audit --no-fund }
            if ($LASTEXITCODE -ne 0) {
                Write-Host '[supervisor] ERROR: frontend npm install 失败，跳过前端启动'
                return
            }
        } catch {
            Write-Host "[supervisor] ERROR: frontend npm install 出错，跳过前端启动: $($_.Exception.Message)"
            return
        } finally {
            Pop-Location
        }
    }

    Stop-PortHolders $FrontendPort
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') start frontend (vite dev :$FrontendPort)..."
    $utf8Command = "chcp.com 65001 > `$null; `$utf8Encoding = [System.Text.UTF8Encoding]::new(`$false); [Console]::InputEncoding = `$utf8Encoding; [Console]::OutputEncoding = `$utf8Encoding; `$global:OutputEncoding = `$utf8Encoding"
    $dirLiteral = Quote-PowerShellLiteral $frontendDir
    $runCommand = "$utf8Command; Set-Location -LiteralPath $dirLiteral; npm run dev"
    $script:frontend = Start-Process -FilePath (Resolve-PowerShellExe) `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $runCommand) `
        -PassThru -NoNewWindow
}

function Stop-Frontend {
    if ($script:frontend -and -not $script:frontend.HasExited) {
        # npm spawns node/esbuild children, so stop the whole process tree.
        & taskkill /PID $script:frontend.Id /T /F 2>&1 | Out-Null
    }
}

function Protect-AutoUpdateLogText([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return '' }
    $singleLine = ($value -replace '[\r\n]+', ' ').Trim()
    # Never persist credentials when a Git implementation happens to echo a credentialed URL.
    $singleLine = $singleLine -replace '(?i)(https?://)[^/@\s]+@', '$1***@'
    if ($singleLine.Length -gt 600) { return $singleLine.Substring(0, 600) + '…' }
    return $singleLine
}

function Write-AutoUpdateLog([string]$message) {
    $safeMessage = Protect-AutoUpdateLogText $message
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff') $safeMessage"
    Write-Host "[auto-update] $safeMessage"
    try {
        $logDir = Split-Path -Parent $script:autoUpdateLogFile
        [System.IO.Directory]::CreateDirectory($logDir) | Out-Null
        [System.IO.File]::AppendAllText(
            $script:autoUpdateLogFile,
            $line + [Environment]::NewLine,
            [System.Text.UTF8Encoding]::new($false))
    } catch {
        # Persistent logging is best-effort; console supervision must keep running.
    }
}

function Set-AutoUpdateState([string]$state, [string]$message, [string]$errorText = '') {
    $script:autoUpdateState = $state
    $script:autoUpdateLastError = if ($errorText) { Protect-AutoUpdateLogText $errorText } else { $null }
    $logKey = "$state|$message|$($script:autoUpdateLastError)"
    if ($script:autoUpdateLastLogKey -ne $logKey) {
        $script:autoUpdateLastLogKey = $logKey
        $logMessage = if ($script:autoUpdateLastError) {
            "$message | error=$($script:autoUpdateLastError)"
        } else { $message }
        Write-AutoUpdateLog $logMessage
    }
}

function New-CapturedProcess([string]$filePath, [string[]]$arguments, [int]$timeoutSeconds) {
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $filePath
    $startInfo.WorkingDirectory = $RepoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Environment['GIT_TERMINAL_PROMPT'] = '0'
    $startInfo.Environment['GCM_INTERACTIVE'] = 'Never'
    foreach ($argument in $arguments) { $startInfo.ArgumentList.Add($argument) }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "无法启动进程：$filePath" }
    return [pscustomobject]@{
        Process = $process
        StdoutTask = $process.StandardOutput.ReadToEndAsync()
        StderrTask = $process.StandardError.ReadToEndAsync()
        StartedAt = Get-Date
        TimeoutSeconds = $timeoutSeconds
    }
}

function Complete-CapturedProcess($capture, [bool]$allowRunning = $false) {
    $process = $capture.Process
    if (-not $process.HasExited) {
        $elapsed = ((Get-Date) - $capture.StartedAt).TotalSeconds
        if ($allowRunning -and $elapsed -lt $capture.TimeoutSeconds) { return $null }
        if (-not $process.WaitForExit([Math]::Max(0, [int](($capture.TimeoutSeconds - $elapsed) * 1000)))) {
            try { $process.Kill($true) } catch { }
            try { $process.WaitForExit(2000) | Out-Null } catch { }
            if (-not $process.HasExited) {
                $process.Dispose()
                return [pscustomobject]@{ ExitCode = -1; Output = ''; Error = 'process did not exit after timeout'; TimedOut = $true }
            }
            $stdout = try { $capture.StdoutTask.GetAwaiter().GetResult() } catch { '' }
            $stderr = try { $capture.StderrTask.GetAwaiter().GetResult() } catch { '' }
            $process.Dispose()
            return [pscustomobject]@{ ExitCode = -1; Output = $stdout; Error = $stderr; TimedOut = $true }
        }
    }
    $stdout = try { $capture.StdoutTask.GetAwaiter().GetResult() } catch { '' }
    $stderr = try { $capture.StderrTask.GetAwaiter().GetResult() } catch { '' }
    $exitCode = $process.ExitCode
    $process.Dispose()
    return [pscustomobject]@{ ExitCode = $exitCode; Output = $stdout; Error = $stderr; TimedOut = $false }
}

function Invoke-GitCapture([string[]]$arguments, [int]$timeoutSeconds = 10) {
    try {
        $capture = New-CapturedProcess $script:GitCmd $arguments $timeoutSeconds
        return Complete-CapturedProcess $capture
    } catch {
        return [pscustomobject]@{ ExitCode = -1; Output = ''; Error = $_.Exception.Message; TimedOut = $false }
    }
}

function Get-GitOperationMarker {
    foreach ($marker in @('index.lock', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG', 'sequencer', 'rebase-apply', 'rebase-merge')) {
        $pathResult = Invoke-GitCapture @('rev-parse', '--git-path', $marker)
        if ($pathResult.ExitCode -ne 0) { continue }
        $path = $pathResult.Output.Trim()
        if ($path -and -not [System.IO.Path]::IsPathRooted($path)) { $path = Join-Path $RepoRoot $path }
        if ($path -and (Test-Path -LiteralPath $path)) { return $marker }
    }
    return $null
}

function Get-AutoUpdateGitState {
    $branchResult = Invoke-GitCapture @('symbolic-ref', '--quiet', '--short', 'HEAD')
    if ($branchResult.ExitCode -ne 0) {
        return [pscustomobject]@{ Safe = $false; State = 'blocked-detached'; Message = 'HEAD 处于 detached 状态，等待人工处理' }
    }
    $branch = $branchResult.Output.Trim()
    if ($branch -ne $script:AutoUpdateBranch) {
        return [pscustomobject]@{ Safe = $false; State = 'blocked-branch'; Message = "当前分支 $branch，不是配置分支 $($script:AutoUpdateBranch)" }
    }

    $upstreamResult = Invoke-GitCapture @('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')
    $expectedUpstream = "$($script:AutoUpdateRemote)/$($script:AutoUpdateBranch)"
    if ($upstreamResult.ExitCode -ne 0 -or $upstreamResult.Output.Trim() -ne $expectedUpstream) {
        $actual = if ($upstreamResult.ExitCode -eq 0) { $upstreamResult.Output.Trim() } else { '未配置' }
        return [pscustomobject]@{ Safe = $false; State = 'blocked-upstream'; Message = "跟踪分支为 $actual，期望 $expectedUpstream" }
    }

    $marker = Get-GitOperationMarker
    if ($marker) {
        return [pscustomobject]@{ Safe = $false; State = 'blocked-git-operation'; Message = "Git 操作尚未结束（$marker），等待人工处理" }
    }
    $statusResult = Invoke-GitCapture @('status', '--porcelain=v2', '--untracked-files=all')
    if ($statusResult.ExitCode -ne 0) {
        return [pscustomobject]@{ Safe = $false; State = 'git-error'; Message = '读取工作树状态失败'; Error = $statusResult.Error }
    }
    if (-not [string]::IsNullOrWhiteSpace($statusResult.Output)) {
        return [pscustomobject]@{ Safe = $false; State = 'blocked-dirty'; Message = '工作树有未提交或未跟踪文件，更新已延期（不会 stash/reset/clean）' }
    }

    $remoteRef = "refs/remotes/$($script:AutoUpdateRemote)/$($script:AutoUpdateBranch)"
    $localResult = Invoke-GitCapture @('rev-parse', 'HEAD')
    $remoteResult = Invoke-GitCapture @('rev-parse', $remoteRef)
    if ($localResult.ExitCode -ne 0 -or $remoteResult.ExitCode -ne 0) {
        return [pscustomobject]@{ Safe = $false; State = 'git-error'; Message = '无法解析本地或远端 HEAD'; Error = "$($localResult.Error) $($remoteResult.Error)" }
    }
    $countsResult = Invoke-GitCapture @('rev-list', '--left-right', '--count', "HEAD...$remoteRef")
    $counts = $countsResult.Output.Trim() -split '\s+'
    if ($countsResult.ExitCode -ne 0 -or $counts.Count -lt 2) {
        return [pscustomobject]@{ Safe = $false; State = 'git-error'; Message = '无法比较本地与远端提交'; Error = $countsResult.Error }
    }
    $ahead = 0
    $behind = 0
    if (-not [int]::TryParse($counts[0], [ref]$ahead) -or -not [int]::TryParse($counts[1], [ref]$behind)) {
        return [pscustomobject]@{ Safe = $false; State = 'git-error'; Message = 'Git 提交计数格式异常'; Error = $countsResult.Output }
    }
    return [pscustomobject]@{
        Safe = $true
        State = 'ready'
        Branch = $branch
        Upstream = $expectedUpstream
        RemoteRef = $remoteRef
        LocalHead = $localResult.Output.Trim()
        RemoteHead = $remoteResult.Output.Trim()
        Ahead = $ahead
        Behind = $behind
    }
}

function Test-AutoUpdateRuntimeIdle {
    if (-not $script:AutoUpdateRequireIdle) {
        return [pscustomobject]@{ Safe = $true; Message = 'idle guard disabled by configuration' }
    }
    if (-not $script:backend -or $script:backend.HasExited) {
        return [pscustomobject]@{ Safe = $true; Message = 'backend is not running' }
    }
    try {
        $activity = Invoke-RestMethod -Method Get `
            -Uri "http://127.0.0.1:$BackendPort/api/claude-chat/sessions/activity" `
            -TimeoutSec 4
        if ($activity.safeToRestart -eq $true) {
            return [pscustomobject]@{ Safe = $true; Message = 'runtime is idle' }
        }
        $summary = "running=$($activity.runningTurnCount), uncertain=$($activity.uncertainSessionCount), pending=$($activity.pendingRequestCount), background=$($activity.backgroundTaskCount), oneShot=$($activity.oneShotCount)"
        return [pscustomobject]@{ Safe = $false; Message = "仍有 Agent 作业（$summary）" }
    } catch {
        return [pscustomobject]@{ Safe = $false; Message = '无法确认运行时已空闲，更新已延期'; Error = $_.Exception.Message }
    }
}

function Test-AutoUpdateCandidateSupervisor([string]$remoteRef) {
    $scriptResult = Invoke-GitCapture @('show', "${remoteRef}:scripts/run-supervised.ps1") 10
    if ($scriptResult.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($scriptResult.Output)) {
        return [pscustomobject]@{ Safe = $false; Message = '候选版本缺少可执行的 supervisor 脚本'; Error = $scriptResult.Error }
    }
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseInput(
        $scriptResult.Output, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) {
        $detail = ($parseErrors | Select-Object -First 3 | ForEach-Object { $_.Message }) -join '; '
        return [pscustomobject]@{ Safe = $false; Message = '候选 supervisor 存在 PowerShell 语法错误'; Error = $detail }
    }
    $parameterNames = @($ast.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath })
    $requiredParameters = @('SupervisorWorker', 'Mode', 'Observability', 'HotReload',
        'AutoUpdate', 'AutoUpdateIntervalSeconds')
    $missingParameters = @($requiredParameters | Where-Object { $_ -notin $parameterNames })
    if ($missingParameters.Count -gt 0) {
        return [pscustomobject]@{ Safe = $false; Message = '候选 supervisor 不再接受自动更新自重载参数'; Error = "missing=$($missingParameters -join ',')" }
    }
    return [pscustomobject]@{ Safe = $true; Message = 'candidate supervisor is valid' }
}

function Set-NextAutoUpdateCheck([int]$seconds) {
    $script:autoUpdateNextCheck = (Get-Date).AddSeconds([Math]::Max(1, $seconds))
}

function Register-AutoUpdateFetchFailure($result) {
    $script:autoUpdateFetchFailures++
    $backoff = [Math]::Min(900, $AutoUpdateIntervalSeconds * [Math]::Pow(2, [Math]::Min(3, $script:autoUpdateFetchFailures)))
    $jitter = Get-Random -Minimum 0 -Maximum ([Math]::Max(2, [int]($backoff * 0.2)))
    Set-NextAutoUpdateCheck ([int]$backoff + $jitter)
    $detail = if ($result.TimedOut) { 'fetch timeout' } elseif ($result.Error) { $result.Error } else { "exit=$($result.ExitCode)" }
    Set-AutoUpdateState 'fetch-error' "fetch 失败，$([int]$backoff)s 后重试" $detail
}

function Complete-AutoUpdateFetch($fetchResult) {
    $script:autoUpdateLastCheck = Get-Date
    if ($fetchResult.ExitCode -ne 0) {
        Register-AutoUpdateFetchFailure $fetchResult
        return $false
    }
    $script:autoUpdateFetchFailures = 0

    $gitState = Get-AutoUpdateGitState
    if (-not $gitState.Safe) {
        Set-NextAutoUpdateCheck $AutoUpdateIntervalSeconds
        Set-AutoUpdateState $gitState.State $gitState.Message $gitState.Error
        return $false
    }
    $script:autoUpdateLocalHead = $gitState.LocalHead
    $script:autoUpdateRemoteHead = $gitState.RemoteHead

    if ($gitState.Ahead -gt 0 -and $gitState.Behind -gt 0) {
        $script:autoUpdateCandidateSha = $null
        Set-NextAutoUpdateCheck $AutoUpdateIntervalSeconds
        Set-AutoUpdateState 'blocked-diverged' "本地与 $($gitState.Upstream) 已分叉（ahead=$($gitState.Ahead), behind=$($gitState.Behind)），等待人工处理"
        return $false
    }
    if ($gitState.Ahead -gt 0) {
        $script:autoUpdateCandidateSha = $null
        Set-NextAutoUpdateCheck $AutoUpdateIntervalSeconds
        Set-AutoUpdateState 'blocked-ahead' "本地领先 $($gitState.Upstream) $($gitState.Ahead) 个提交，不自动覆盖"
        return $false
    }
    if ($gitState.Behind -eq 0) {
        $script:autoUpdateCandidateSha = $null
        $script:autoUpdateCandidateSince = $null
        Set-NextAutoUpdateCheck $AutoUpdateIntervalSeconds
        Set-AutoUpdateState 'up-to-date' "已是最新：$($gitState.LocalHead.Substring(0, 8))"
        return $false
    }

    $now = Get-Date
    if ($script:autoUpdateCandidateSha -ne $gitState.RemoteHead) {
        $script:autoUpdateCandidateSha = $gitState.RemoteHead
        $script:autoUpdateCandidateSince = $now
        Set-NextAutoUpdateCheck ([Math]::Min(60, $AutoUpdateIntervalSeconds))
        Set-AutoUpdateState 'stabilizing' "发现 $($gitState.Behind) 个新提交，等待远端 SHA 稳定 $($script:AutoUpdateStableSeconds)s：$($gitState.RemoteHead.Substring(0, 8))"
        return $false
    }
    $stableFor = ($now - $script:autoUpdateCandidateSince).TotalSeconds
    if ($stableFor -lt $script:AutoUpdateStableSeconds) {
        Set-NextAutoUpdateCheck ([Math]::Min(60, $AutoUpdateIntervalSeconds))
        Set-AutoUpdateState 'stabilizing' "候选 $($gitState.RemoteHead.Substring(0, 8)) 已稳定 $([int]$stableFor)s/$($script:AutoUpdateStableSeconds)s"
        return $false
    }

    $candidateSupervisor = Test-AutoUpdateCandidateSupervisor $gitState.RemoteRef
    if (-not $candidateSupervisor.Safe) {
        Set-NextAutoUpdateCheck $AutoUpdateIntervalSeconds
        Set-AutoUpdateState 'candidate-invalid' $candidateSupervisor.Message $candidateSupervisor.Error
        return $false
    }

    $runtime = Test-AutoUpdateRuntimeIdle
    if (-not $runtime.Safe) {
        Set-NextAutoUpdateCheck ([Math]::Min(60, $AutoUpdateIntervalSeconds))
        Set-AutoUpdateState 'waiting-for-idle' $runtime.Message $runtime.Error
        return $false
    }

    # Re-read every safety gate immediately before promotion to close the fetch/check TOCTOU window.
    $finalState = Get-AutoUpdateGitState
    if (-not $finalState.Safe -or $finalState.LocalHead -ne $gitState.LocalHead -or
        $finalState.RemoteHead -ne $script:autoUpdateCandidateSha -or $finalState.Ahead -ne 0 -or $finalState.Behind -le 0) {
        Set-NextAutoUpdateCheck ([Math]::Min(60, $AutoUpdateIntervalSeconds))
        Set-AutoUpdateState 'state-changed' '应用前仓库状态发生变化，重新检查'
        return $false
    }

    # Stop Vite before changing the working tree, avoiding a transient new-frontend/old-backend mix.
    Stop-Frontend
    $finalRuntime = Test-AutoUpdateRuntimeIdle
    if (-not $finalRuntime.Safe) {
        Start-Frontend
        Set-NextAutoUpdateCheck ([Math]::Min(60, $AutoUpdateIntervalSeconds))
        Set-AutoUpdateState 'waiting-for-idle' "应用前检测到新作业：$($finalRuntime.Message)" $finalRuntime.Error
        return $false
    }
    $mergeResult = Invoke-GitCapture @('merge', '--ff-only', $finalState.RemoteRef) 60
    if ($mergeResult.ExitCode -ne 0) {
        Start-Frontend
        Set-NextAutoUpdateCheck $AutoUpdateIntervalSeconds
        Set-AutoUpdateState 'merge-error' 'fast-forward 失败；旧服务继续运行' $mergeResult.Error
        return $false
    }

    $newHeadResult = Invoke-GitCapture @('rev-parse', 'HEAD')
    $newHead = if ($newHeadResult.ExitCode -eq 0) { $newHeadResult.Output.Trim() } else { $script:autoUpdateCandidateSha }
    $script:autoUpdateLocalHead = $newHead
    $script:autoUpdateRelaunchRequested = $true
    Set-AutoUpdateState 'restarting' "已 fast-forward $($gitState.LocalHead.Substring(0, 8)) -> $($newHead.Substring(0, 8))，开始全栈自重载"
    return $true
}

function Update-AutoUpdate {
    if (-not $script:AutoUpdateEnabled) { return $false }

    if ($script:autoUpdateFetch) {
        $fetchResult = Complete-CapturedProcess $script:autoUpdateFetch $true
        if ($null -eq $fetchResult) { return $false }
        $script:autoUpdateFetch = $null
        return Complete-AutoUpdateFetch $fetchResult
    }
    if ((Get-Date) -lt $script:autoUpdateNextCheck) { return $false }

    $refspec = "+refs/heads/$($script:AutoUpdateBranch):refs/remotes/$($script:AutoUpdateRemote)/$($script:AutoUpdateBranch)"
    try {
        $script:autoUpdateFetch = New-CapturedProcess $script:GitCmd @(
            'fetch', '--quiet', '--no-tags', '--prune', $script:AutoUpdateRemote, $refspec
        ) 45
        $script:autoUpdateState = 'fetching'
    } catch {
        Register-AutoUpdateFetchFailure ([pscustomobject]@{
            ExitCode = -1; Error = $_.Exception.Message; TimedOut = $false
        })
    }
    return $false
}

function Update-AutoUpdateSafely {
    try {
        return Update-AutoUpdate
    } catch {
        if ($script:autoUpdateFetch) {
            try {
                if (-not $script:autoUpdateFetch.Process.HasExited) {
                    $script:autoUpdateFetch.Process.Kill($true)
                }
                $script:autoUpdateFetch.Process.Dispose()
            } catch { }
            $script:autoUpdateFetch = $null
        }
        if (-not $script:autoUpdateRelaunchRequested -and
            (-not $script:frontend -or $script:frontend.HasExited)) {
            Start-Frontend
        }
        Set-NextAutoUpdateCheck $AutoUpdateIntervalSeconds
        Set-AutoUpdateState 'internal-error' '自动更新内部异常；服务继续运行，稍后重试' $_.Exception.Message
        return $false
    }
}

function Write-Json($res, [int]$code, $obj) {
    $res.StatusCode = $code
    $res.ContentType = 'application/json; charset=utf-8'
    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.Headers.Add('Access-Control-Allow-Headers', 'X-Restart-Token, Content-Type')
    $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
}

function Test-FullReloadToken([string]$provided) {
    if ([string]::IsNullOrWhiteSpace($provided)) { return $false }
    if (-not [string]::IsNullOrWhiteSpace($script:InternalControlToken) -and
        $provided -ceq $script:InternalControlToken) { return $true }
    return ((-not [string]::IsNullOrWhiteSpace($RestartToken)) -and ($provided -ceq $RestartToken))
}

function Handle-Request($ctx) {
    $req = $ctx.Request
    $res = $ctx.Response
    $path = $req.Url.AbsolutePath
    $method = $req.HttpMethod
    if ($method -eq 'OPTIONS') { Write-Json $res 204 @{} ; return }

    if ($path -eq '/status' -and $method -eq 'GET') {
        $up = ($null -ne $script:backend) -and (-not $script:backend.HasExited)
        Write-Json $res 200 @{
            protocolVersion = 1
            repoRoot = $RepoRoot
            capabilities = @{ fullReload = $true }
            backendUp = $up
            pid       = if ($script:backend) { $script:backend.Id } else { $null }
            lastStart = if ($script:lastStart) { $script:lastStart.ToString('s') } else { $null }
            autoUpdate = @{
                owner = 'java'
                enabled = $script:JavaAutoUpdateEnabled
                source = "$($script:AutoUpdateRemote)/$($script:AutoUpdateBranch)"
                intervalSeconds = $AutoUpdateIntervalSeconds
                stableSeconds = $script:AutoUpdateStableSeconds
                requireIdle = $script:AutoUpdateRequireIdle
                state = $script:autoUpdateState
                lastCheck = if ($script:autoUpdateLastCheck) { $script:autoUpdateLastCheck.ToString('s') } else { $null }
                nextCheck = if ($script:autoUpdateNextCheck) { $script:autoUpdateNextCheck.ToString('s') } else { $null }
                localHead = $script:autoUpdateLocalHead
                remoteHead = $script:autoUpdateRemoteHead
                candidateHead = $script:autoUpdateCandidateSha
                lastError = $script:autoUpdateLastError
            }
        }
        return
    }

    if ($path -in @('/reload', '/full-reload') -and $method -eq 'POST') {
        $token = $req.Headers['X-Restart-Token']
        if ([string]::IsNullOrWhiteSpace($token)) { $token = $req.QueryString['token'] }
        if (-not (Test-FullReloadToken $token)) {
            Write-Json $res 403 @{ error = 'token mismatch' }
            return
        }
        $script:autoUpdateRelaunchRequested = $true
        Write-Json $res 202 @{ ok = $true; message = 'full reload accepted' }
        Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') $path received; reloading the full stack"
        return
    }

    if ($path -eq '/restart' -and $method -eq 'POST') {
        if ([string]::IsNullOrWhiteSpace($RestartToken)) { Write-Json $res 503 @{ error = 'RestartToken is not configured' }; return }
        $token = $req.Headers['X-Restart-Token']
        if ([string]::IsNullOrWhiteSpace($token)) { $token = $req.QueryString['token'] }
        if ($token -ne $RestartToken) { Write-Json $res 403 @{ error = 'token mismatch' }; return }
        Write-Json $res 200 @{ ok = $true; message = 'restart triggered, backend + python sidecars will return soon' }
        Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') /restart received, taking over port and restarting"
        Stop-Backend
        Stop-PortHolders $BackendPort
        # node claude-agent sidecar(:18890) 由守护循环随后调用的 Start-Backend 统一清理+懒启动，这里不重复处理。
        # 一并回收 Python sidecar，否则改了 sidecar 代码/配置后重启不生效（旧进程占着端口被 skip）。
        Restart-PythonSidecars
        return
    }
    Write-Json $res 404 @{ error = 'not found' }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($HttpPrefix)
try {
    $listener.Start()
} catch {
    Write-Host "[supervisor] HTTP control endpoint failed: $($_.Exception.Message)"
    Write-Host "[supervisor] If Access Denied, run as admin once: netsh http add urlacl url=$HttpPrefix user=$env:USERNAME"
    $controlHolder = Get-PortHolder 18081
    if ($controlHolder.Occupied) {
        Write-Host "[supervisor] :18081 已被 PID=$($controlHolder.ProcessId) 占用；为避免两个 supervisor 互抢服务端口，本实例退出"
        if ($script:supervisorMutexAcquired) {
            try { $script:supervisorMutex.ReleaseMutex() } catch { }
            $script:supervisorMutexAcquired = $false
        }
        try { $script:supervisorMutex.Dispose() } catch { }
        if ($script:supervisorPidFile -and (Test-Path -LiteralPath $script:supervisorPidFile)) {
            try {
                $recordedPid = [System.IO.File]::ReadAllText($script:supervisorPidFile).Trim()
                if ($recordedPid -eq "$PID") { Remove-Item -LiteralPath $script:supervisorPidFile -Force }
            } catch { }
        }
        return
    }
    Write-Host "[supervisor] 控制端口无人占用，继续以无 HTTP 控制模式守护。"
    $listener = $null
}
if ($listener) { Write-Host "[supervisor] HTTP control $HttpPrefix  (POST /restart|/reload|/full-reload, GET /status)" }
Write-Host "[supervisor] repo=$RepoRoot  mode=$Mode  observability=$Observability  mvn=$MvnCmd  java=$JavaCmd"
Write-Host "[supervisor] whisper mode=$WhisperMode（改用 run-tools.conf 的 TOOLBOX_WHISPER_MODE）"
if ($script:JavaAutoUpdateEnabled) {
    Write-Host "[auto-update] Java 调度已启用：source=$($script:AutoUpdateRemote)/$($script:AutoUpdateBranch), check=${AutoUpdateIntervalSeconds}s, stable=$($script:AutoUpdateStableSeconds)s, requireIdle=$($script:AutoUpdateRequireIdle)"
} else {
    Write-Host '[auto-update] Java 调度已显式关闭（TOOLBOX_AUTO_UPDATE_ENABLED=false）'
}

# 起服务前先把两个 node sidecar 的依赖/构建补齐（幂等，已就绪则秒过）。
Initialize-NodeDeps

# 一键：后端 + 前端一起拉起，各自守护；退出（Ctrl+C）时一并收尾。
Start-Backend
Start-Frontend
Start-HotReloadWatcher
# 微信监控 sidecar：尽力起一次，失败/缺依赖只 WARN，不进守护循环，不连累上面两个。
Start-WechatSidecar
# 访客分析 AgentScope sidecar：同样尽力起一次（端口 9600），失败只 WARN。
Start-VisitorAnalysisSidecar
# faster-whisper ASR sidecar：仅 asr-service 模式需要（端口 9500），cli 模式自动跳过。
Start-FasterWhisperSidecar
# AgentScope Studio：移动端监控入口（端口 3000），失败不影响 toolbox 主流程。
Start-AgentScopeStudio

try {
    if ($listener) {
        $ctxTask = $listener.GetContextAsync()
        while ($true) {
            if ($ctxTask.Wait(1000)) {
                try { Handle-Request $ctxTask.Result } catch { Write-Host "[supervisor] request handling error: $($_.Exception.Message)" }
                $ctxTask = $listener.GetContextAsync()
            }
            if ($script:autoUpdateRelaunchRequested) { break }
            Update-HotReload
            if (-not $script:backend -or $script:backend.HasExited) {
                Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') backend exited, restart after 2s"
                Start-Sleep -Seconds 2
                Start-Backend
            }
            if (-not $script:frontend -or $script:frontend.HasExited) {
                Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') frontend exited, restart after 2s"
                Start-Sleep -Seconds 2
                Start-Frontend
            }
        }
    } else {
        # No control endpoint: supervise only.
        while ($true) {
            if ($script:autoUpdateRelaunchRequested) { break }
            Update-HotReload
            if (-not $script:backend -or $script:backend.HasExited) {
                Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') backend exited, restart after 2s"
                Start-Sleep -Seconds 2
                Start-Backend
            }
            if (-not $script:frontend -or $script:frontend.HasExited) {
                Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') frontend exited, restart after 2s"
                Start-Sleep -Seconds 2
                Start-Frontend
            }
            Start-Sleep -Seconds 1
        }
    }
} finally {
    Write-Host '[supervisor] shutting down: stopping frontend + backend...'
    if ($script:autoUpdateFetch) {
        try { $script:autoUpdateFetch.Process.Kill($true) } catch { }
        try { $script:autoUpdateFetch.Process.Dispose() } catch { }
        $script:autoUpdateFetch = $null
    }
    if ($listener) {
        try { $listener.Stop() } catch { }
        try { $listener.Close() } catch { }
    }
    Stop-HotReloadWatcher
    Stop-Frontend
    Stop-Backend
    if ($script:autoUpdateRelaunchRequested) {
        Stop-PortHolders $SidecarPort
        Stop-PortHolders $BrowserServicePort
        Stop-PortHolders 9600
        Stop-PortHolders 9700
        if ($WhisperMode -eq 'asr-service') { Stop-PortHolders $AsrPort }
    }
    if ($script:supervisorMutexAcquired) {
        try { $script:supervisorMutex.ReleaseMutex() } catch { }
        $script:supervisorMutexAcquired = $false
    }
    if ($script:supervisorMutex) {
        try { $script:supervisorMutex.Dispose() } catch { }
    }
    if ($script:supervisorPidFile -and (Test-Path -LiteralPath $script:supervisorPidFile)) {
        try {
            $recordedPid = [System.IO.File]::ReadAllText($script:supervisorPidFile).Trim()
            if ($recordedPid -eq "$PID") { Remove-Item -LiteralPath $script:supervisorPidFile -Force }
        } catch { }
    }
}

if ($script:autoUpdateRelaunchRequested) {
    Write-Host '[supervisor] 服务已停止，通知稳定 bootstrap 加载最新 supervisor'
    exit $AutoUpdateRelaunchExitCode
}
