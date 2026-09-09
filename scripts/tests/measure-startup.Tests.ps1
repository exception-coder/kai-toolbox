$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$launcher = Join-Path $repoRoot 'scripts/measure-startup.ps1'
$powerShell = (Get-Command powershell).Source

Describe 'Startup measurement failure evidence' {
    $fixtureRoot = Join-Path $TestDrive 'process-fixture'
    New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
    $jdkBin = Split-Path -Parent (Get-Command java).Source
    & (Join-Path $jdkBin 'javac.exe') -encoding UTF-8 -d $fixtureRoot `
        (Join-Path $PSScriptRoot 'fixtures/StartupProcessFixture.java')
    if ($LASTEXITCODE -ne 0) { throw 'Process fixture compilation failed' }
    $fixtureJar = Join-Path $fixtureRoot 'fixture.jar'
    & (Join-Path $jdkBin 'jar.exe') --create --file $fixtureJar --main-class StartupProcessFixture `
        -C $fixtureRoot StartupProcessFixture.class
    if ($LASTEXITCODE -ne 0) { throw 'Process fixture packaging failed' }

    It 'parses without PowerShell syntax errors' {
        $tokens = $null
        $parseErrors = $null
        [Management.Automation.Language.Parser]::ParseFile($launcher, [ref]$tokens, [ref]$parseErrors) | Out-Null
        $parseErrors.Count | Should Be 0
    }

    It 'rejects query strings and retains a failed report without a build or launch' {
        $outputRoot = Join-Path $TestDrive 'invalid'
        & $powerShell -NoProfile -ExecutionPolicy Bypass -File $launcher -SkipBuild `
            -TargetPath '/api/tools?secret=do-not-record' -OutputRoot $outputRoot | Out-Null
        $LASTEXITCODE | Should Be 1
        $file = Get-ChildItem $outputRoot -Filter report.json -Recurse | Select-Object -First 1
        $report = Get-Content $file.FullName -Raw | ConvertFrom-Json
        $report.status | Should Be 'FAILED'
        $report.build.status | Should Be 'NOT_MEASURED'
        $report.runtime | Should BeNullOrEmpty
        (Get-Content $file.FullName -Raw).Contains('do-not-record') | Should Be $false
    }

    It 'refuses a busy port without stopping its owner' {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        try {
            $port = $listener.LocalEndpoint.Port
            & $powerShell -NoProfile -ExecutionPolicy Bypass -File $launcher -SkipBuild `
                -Port $port -OutputRoot (Join-Path $TestDrive 'busy') | Out-Null
            $LASTEXITCODE | Should Be 1
            $listener.Server.IsBound | Should Be $true
        } finally { $listener.Stop() }
    }

    It 'records the actual Maven failure code and never launches the application' {
        $bin = Join-Path $TestDrive 'bin'
        New-Item -ItemType Directory -Path $bin | Out-Null
        Set-Content -LiteralPath (Join-Path $bin 'mvn.cmd') -Value '@exit /b 17' -Encoding Ascii
        $previousPath = $env:PATH
        try {
            $env:PATH = $bin + ';' + $previousPath
            $outputRoot = Join-Path $TestDrive 'build-failure'
            & $powerShell -NoProfile -ExecutionPolicy Bypass -File $launcher -OutputRoot $outputRoot | Out-Null
            $LASTEXITCODE | Should Be 1
            $file = Get-ChildItem $outputRoot -Filter report.json -Recurse | Select-Object -First 1
            $report = Get-Content $file.FullName -Raw | ConvertFrom-Json
            $report.build.status | Should Be 'FAILED'
            $report.build.exitCode | Should Be 17
            ($report.build.durationMs -ge 0) | Should Be $true
            $report.launch.status | Should Be 'NOT_MEASURED'
        } finally { $env:PATH = $previousPath }
    }

    It 'correlates a successful child report and stops the owned process' {
        $env:STARTUP_TEST_MODE = 'ready'
        try {
            $outputRoot = Join-Path $TestDrive 'ready'
            & $powerShell -NoProfile -ExecutionPolicy Bypass -File $launcher -SkipBuild `
                -ApplicationJar $fixtureJar -OutputRoot $outputRoot | Out-Null
            $LASTEXITCODE | Should Be 0
            $file = Get-ChildItem $outputRoot -Filter report.json -Recurse | Select-Object -First 1
            $report = Get-Content $file.FullName -Raw | ConvertFrom-Json
            $report.status | Should Be 'COMPLETED'
            $report.runtime.runId | Should Be $report.runId
            $report.launch.status | Should Be 'COMPLETED'
            Get-Process -Id $report.runtime.processId -ErrorAction SilentlyContinue | Should BeNullOrEmpty
        } finally { Remove-Item Env:STARTUP_TEST_MODE }
    }

    It 'retains runtime exit and timeout failures' {
        foreach ($mode in @('fail', 'hang')) {
            $env:STARTUP_TEST_MODE = $mode
            try {
                $outputRoot = Join-Path $TestDrive $mode
                & $powerShell -NoProfile -ExecutionPolicy Bypass -File $launcher -SkipBuild -TimeoutSeconds 5 `
                    -ApplicationJar $fixtureJar -OutputRoot $outputRoot | Out-Null
                $LASTEXITCODE | Should Be 1
                $file = Get-ChildItem $outputRoot -Filter report.json -Recurse | Select-Object -First 1
                $report = Get-Content $file.FullName -Raw | ConvertFrom-Json
                if ($mode -eq 'fail') {
                    $report.launch.status | Should Be 'FAILED'
                    $report.launch.exitCode | Should Be 19
                } else { $report.launch.status | Should Be 'TIMED_OUT' }
            } finally { Remove-Item Env:STARTUP_TEST_MODE }
        }
    }
}
