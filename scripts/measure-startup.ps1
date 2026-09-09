<#
.SYNOPSIS
Measure Maven build and application startup on an isolated port and data directory.
.EXAMPLE
./scripts/measure-startup.ps1 -Port 18090 -SkipBuild
.EXAMPLE
./scripts/measure-startup.ps1 -Port 18090 -TargetPath /api/tools
#>
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 18090,
    [ValidateRange(5, 600)][int]$TimeoutSeconds = 120,
    [switch]$SkipBuild,
    [string]$TargetPath = '',
    [string]$ApplicationJar = '',
    [string]$OutputRoot = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runId = [Guid]::NewGuid().ToString()
if (-not $OutputRoot) { $OutputRoot = Join-Path $repoRoot 'outputs/startup-performance' }
$runDirectory = Join-Path ([IO.Path]::GetFullPath($OutputRoot)) $runId
[IO.Directory]::CreateDirectory($runDirectory) | Out-Null
$runtimePath = Join-Path $runDirectory 'runtime.json'
$reportPath = Join-Path $runDirectory 'report.json'
$report = [ordered]@{
    schemaVersion = 1
    runId = $runId
    startedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    status = 'RUNNING'
    build = [ordered]@{ status = 'NOT_MEASURED'; scope = 'maven-package'; durationMs = $null; exitCode = $null }
    launch = [ordered]@{ status = 'NOT_MEASURED'; durationToReadyMs = $null; exitCode = $null }
    targetRequest = [ordered]@{ status = 'NOT_MEASURED'; durationMs = $null; statusCode = $null }
    runtime = $null
    error = $null
}
$ownedProcess = $null
$launchTimer = $null
$exitCode = 1

function Save-MeasurementReport {
    $json = $report | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($reportPath, $json, [Text.UTF8Encoding]::new($false))
}

function Assert-MeasurementInputs {
    if ($TargetPath -and ($TargetPath -notmatch '^/api/[a-zA-Z0-9/_{}.-]+$' -or $TargetPath.Contains('..'))) {
        throw 'TargetPath must be a local /api/ path without query strings; only use a safe read-only GET.'
    }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() } finally { $listener.Stop() }
    $java = (Get-Command java -ErrorAction Stop).Source
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $java)
    if (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/javac.exe'))) {
        throw 'The java command must resolve to a JDK installation containing javac.'
    }
}

function Invoke-MeasuredBuild {
    if ($SkipBuild) { return }
    $report.build.status = 'RUNNING'
    Save-MeasurementReport
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        Push-Location $repoRoot
        try {
            & mvn -pl toolbox-starter -am '-Dskip.frontend=true' package *> (Join-Path $runDirectory 'build.log')
            $report.build.exitCode = $LASTEXITCODE
        } finally { Pop-Location }
    } finally {
        $timer.Stop()
        $report.build.durationMs = $timer.ElapsedMilliseconds
        $report.build.status = 'FAILED'
        if ($report.build.exitCode -eq 0) { $report.build.status = 'COMPLETED' }
        Save-MeasurementReport
    }
    if ($report.build.status -ne 'COMPLETED') { throw 'Maven package failed; see build.log.' }
}

function Start-MeasuredApplication {
    $jar = if ($ApplicationJar) { [IO.Path]::GetFullPath($ApplicationJar) } else {
        Join-Path $repoRoot 'toolbox-starter/target/kai-toolbox.jar'
    }
    if (-not (Test-Path -LiteralPath $jar)) { throw 'Application jar missing; run without -SkipBuild first.' }
    $java = (Get-Command java -ErrorAction Stop).Source
    $dataDirectory = Join-Path $runDirectory 'data'
    $javaArguments = @(
        "-Dtoolbox.performance.run-id=$runId",
        "-Dtoolbox.performance.report-path=$runtimePath",
        '-jar', $jar,
        "--server.port=$Port",
        '--server.address=127.0.0.1',
        "--toolbox.data-dir=$dataDirectory",
        "--toolbox.sqlite.file=$dataDirectory/toolbox.db",
        '--toolbox.magnet.enabled=false',
        '--toolbox.mail.enabled=false',
        '--toolbox.ai-secretary.rag.enabled=false',
        '--toolbox.visitor-analysis.rag.enabled=false'
        '--toolbox.browser-request.sidecar.auto-start=false'
    )
    # Quote literal arguments for Windows ProcessStartInfo; do not evaluate them through a shell.
    $quotedArguments = ($javaArguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    $process = Start-Process -FilePath $java -ArgumentList $quotedArguments -WorkingDirectory $repoRoot -PassThru `
        -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runDirectory 'application.log') `
        -RedirectStandardError (Join-Path $runDirectory 'application-error.log')
    # Keep the handle so Windows PowerShell retains the exit code after termination.
    $null = $process.Handle
    return $process
}

function Read-CurrentRuntime {
    if (-not (Test-Path -LiteralPath $runtimePath)) { return $null }
    $snapshot = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    if ($snapshot.runId -ne $runId) { throw 'Runtime report run ID does not match this measurement.' }
    return $snapshot
}

function Wait-MeasuredReady {
    $report.launch.status = 'RUNNING'
    while ($launchTimer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $report.runtime = Read-CurrentRuntime
        if ($report.runtime -and $report.runtime.milestones.applicationReady.status -eq 'COMPLETED') {
            $report.launch.status = 'COMPLETED'
            $report.launch.durationToReadyMs = $launchTimer.ElapsedMilliseconds
            return
        }
        if ($ownedProcess.HasExited) {
            $ownedProcess.WaitForExit()
            $report.launch.status = 'FAILED'
            $report.launch.exitCode = $ownedProcess.ExitCode
            throw 'Application exited before readiness; see application logs.'
        }
        Start-Sleep -Milliseconds 200
    }
    $report.launch.status = 'TIMED_OUT'
    throw 'Application readiness timeout; partial runtime evidence is retained.'
}

function Invoke-MeasuredTarget {
    if (-not $TargetPath) { return }
    $report.targetRequest.status = 'RUNNING'
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$TargetPath" -Method Get `
            -UseBasicParsing -TimeoutSec $TimeoutSeconds -MaximumRedirection 0
        $report.targetRequest.statusCode = [int]$response.StatusCode
        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) { throw 'Target did not return 2xx.' }
        $report.targetRequest.status = 'COMPLETED'
    } catch {
        $report.targetRequest.status = 'FAILED'
        throw
    } finally {
        $timer.Stop()
        $report.targetRequest.durationMs = $timer.ElapsedMilliseconds
    }
}

try {
    Save-MeasurementReport
    Assert-MeasurementInputs
    Invoke-MeasuredBuild
    $launchTimer = [Diagnostics.Stopwatch]::StartNew()
    $ownedProcess = Start-MeasuredApplication
    Wait-MeasuredReady
    Invoke-MeasuredTarget
    $report.status = 'COMPLETED'
    $exitCode = 0
} catch {
    $report.status = 'FAILED'
    Write-Warning ("Startup measurement failed: " + $_.ToString())
    # Retain the failure message without recording JVM arguments, headers or response bodies.
    $report.error = $_.Exception.Message
} finally {
    if ($ownedProcess -and -not $ownedProcess.HasExited) {
        try {
            Stop-Process -Id $ownedProcess.Id -Force
            $ownedProcess.WaitForExit(10000) | Out-Null
        } catch {
            $report.status = 'FAILED'
            $report.error = 'Unable to stop owned measurement process: ' + $_.Exception.Message
            $exitCode = 1
        }
    }
    try { $report.runtime = Read-CurrentRuntime } catch { $report.error = $_.Exception.Message }
    Save-MeasurementReport
    Write-Output $reportPath
}
exit $exitCode
