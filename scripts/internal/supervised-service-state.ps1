function Get-SupervisedRepositoryHash {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $normalizedRepository = [System.IO.Path]::GetFullPath($RepositoryRoot).TrimEnd('\').ToLowerInvariant()
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalizedRepository))
    } finally {
        $sha256.Dispose()
    }
    return ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').Substring(0, 16)
}

function Get-SupervisedServiceStatePath {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [string]$StateRoot
    )

    if ([string]::IsNullOrWhiteSpace($StateRoot)) {
        $StateRoot = Join-Path (
            $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() })
        ) 'kai-toolbox'
    }
    $repositoryHash = Get-SupervisedRepositoryHash -RepositoryRoot $RepositoryRoot
    return Join-Path $StateRoot "supervisor-services-$repositoryHash.json"
}

function New-SupervisedServiceState {
    param([bool]$Enabled)

    return [pscustomobject]@{
        version = 1
        frontendEnabled = $Enabled
        backendEnabled = $Enabled
    }
}

function Get-SupervisedServiceState {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [bool]$MissingStateDefault = $true,
        [string]$StateRoot
    )

    $statePath = Get-SupervisedServiceStatePath -RepositoryRoot $RepositoryRoot -StateRoot $StateRoot
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        return New-SupervisedServiceState -Enabled $MissingStateDefault
    }
    try {
        $state = [System.IO.File]::ReadAllText($statePath) | ConvertFrom-Json
        if ($null -eq $state.frontendEnabled -or $null -eq $state.backendEnabled) {
            throw 'Required service flags are missing.'
        }
        return [pscustomobject]@{
            version = 1
            frontendEnabled = [bool]$state.frontendEnabled
            backendEnabled = [bool]$state.backendEnabled
        }
    } catch {
        return New-SupervisedServiceState -Enabled $MissingStateDefault
    }
}

function Set-SupervisedServiceState {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)]
        [ValidateSet('all', 'frontend', 'backend')]
        [string]$Scope,
        [Parameter(Mandatory = $true)][bool]$Enabled,
        [bool]$MissingStateDefault = $true,
        [string]$StateRoot
    )

    $statePath = Get-SupervisedServiceStatePath -RepositoryRoot $RepositoryRoot -StateRoot $StateRoot
    $stateDirectory = Split-Path -Parent $statePath
    [System.IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
    $repositoryHash = Get-SupervisedRepositoryHash -RepositoryRoot $RepositoryRoot
    $stateMutex = [System.Threading.Mutex]::new($false, "Local\KaiToolboxSupervisorState-$repositoryHash")
    $mutexAcquired = $false
    $temporaryPath = $null
    $backupPath = $null
    try {
        try {
            $mutexAcquired = $stateMutex.WaitOne(5000)
        } catch [System.Threading.AbandonedMutexException] {
            $mutexAcquired = $true
        }
        if (-not $mutexAcquired) { throw 'Timed out while updating supervisor service state.' }

        $state = Get-SupervisedServiceState `
            -RepositoryRoot $RepositoryRoot `
            -MissingStateDefault $MissingStateDefault `
            -StateRoot $StateRoot
        if ($Scope -in @('all', 'frontend')) { $state.frontendEnabled = $Enabled }
        if ($Scope -in @('all', 'backend')) { $state.backendEnabled = $Enabled }

        $json = $state | ConvertTo-Json -Compress
        $temporaryPath = "$statePath.$([Guid]::NewGuid().ToString('N')).tmp"
        [System.IO.File]::WriteAllText($temporaryPath, $json, [System.Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $statePath) {
            $backupPath = "$statePath.$([Guid]::NewGuid().ToString('N')).bak"
            [System.IO.File]::Replace($temporaryPath, $statePath, $backupPath)
            Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        } else {
            [System.IO.File]::Move($temporaryPath, $statePath)
        }
        return $state
    } finally {
        if ($mutexAcquired) {
            try { $stateMutex.ReleaseMutex() } catch { }
        }
        $stateMutex.Dispose()
        if ($temporaryPath -and (Test-Path -LiteralPath $temporaryPath)) {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        }
        if ($backupPath -and (Test-Path -LiteralPath $backupPath)) {
            Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        }
    }
}
