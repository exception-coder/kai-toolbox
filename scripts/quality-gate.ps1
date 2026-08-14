$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot

function Resolve-Executable {
    param([Parameter(Mandatory = $true)][string]$Name)

    $windowsCommand = Get-Command "$Name.cmd" -ErrorAction SilentlyContinue
    if ($null -ne $windowsCommand) {
        return $windowsCommand.Source
    }
    return (Get-Command $Name -ErrorAction Stop).Source
}

function Invoke-QualityStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host "[quality] $Name"
    Push-Location $WorkingDirectory
    try {
        $global:LASTEXITCODE = 0
        & $Command
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Resolve-Java21Home {
    $candidates = @()
    if ($env:JAVA_HOME) {
        $candidates += $env:JAVA_HOME
    }

    $pathJava = Get-Command 'java' -ErrorAction SilentlyContinue
    if ($null -ne $pathJava) {
        $candidates += Split-Path -Parent (Split-Path -Parent $pathJava.Source)
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        $releaseFile = Join-Path $candidate 'release'
        if (-not (Test-Path -LiteralPath $releaseFile)) {
            continue
        }
        $javaExecutable = Join-Path $candidate 'bin/java.exe'
        if (-not (Test-Path -LiteralPath $javaExecutable)) {
            $javaExecutable = Join-Path $candidate 'bin/java'
        }
        if (-not (Test-Path -LiteralPath $javaExecutable)) {
            continue
        }

        $releaseMetadata = Get-Content -Raw -LiteralPath $releaseFile
        if ($releaseMetadata -match 'JAVA_VERSION="21(?:\.|\")') {
            return $candidate
        }
    }

    throw 'Java 21 is required. Configure JAVA_HOME or place a Java 21 executable on PATH.'
}

$npmCommand = Resolve-Executable -Name 'npm'
$mavenCommand = Resolve-Executable -Name 'mvn'
$env:JAVA_HOME = Resolve-Java21Home

Invoke-QualityStep -Name 'frontend tests' -WorkingDirectory "$repositoryRoot/frontend" -Command {
    & $npmCommand run test
}
Invoke-QualityStep -Name 'frontend typecheck and architecture' -WorkingDirectory "$repositoryRoot/frontend" -Command {
    & $npmCommand run typecheck
}
Invoke-QualityStep -Name 'frontend production build' -WorkingDirectory "$repositoryRoot/frontend" -Command {
    & $npmCommand run build
}
Invoke-QualityStep -Name 'sidecar tests' -WorkingDirectory "$repositoryRoot/sidecar/claude-agent" -Command {
    & $npmCommand test
}
Invoke-QualityStep -Name 'backend and module architecture tests' -WorkingDirectory $repositoryRoot -Command {
    Write-Host "[quality] Maven JAVA_HOME=$env:JAVA_HOME"
    & $mavenCommand -B -ntp clean test
}

Write-Host '[quality] all checks passed'
