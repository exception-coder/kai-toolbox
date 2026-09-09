$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repositoryRoot 'scripts/internal/supervised-service-state.ps1')

function Assert-Equal {
    param($Expected, $Actual, [string]$Message)
    if ($Expected -ne $Actual) {
        throw "$Message. Expected=$Expected Actual=$Actual"
    }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("kai-supervisor-state-test-" + [Guid]::NewGuid().ToString('N'))
$stateRoot = Join-Path $testRoot 'state'
$firstRepository = Join-Path $testRoot 'repo-one'
$secondRepository = Join-Path $testRoot 'repo-two'
[System.IO.Directory]::CreateDirectory($firstRepository) | Out-Null
[System.IO.Directory]::CreateDirectory($secondRepository) | Out-Null

try {
    $state = Set-SupervisedServiceState -RepositoryRoot $firstRepository -Scope frontend -Enabled $true -MissingStateDefault $false -StateRoot $stateRoot
    Assert-Equal $true $state.frontendEnabled 'Starting frontend should enable frontend'
    Assert-Equal $false $state.backendEnabled 'Starting frontend should not enable backend'

    $state = Set-SupervisedServiceState -RepositoryRoot $firstRepository -Scope backend -Enabled $true -MissingStateDefault $false -StateRoot $stateRoot
    Assert-Equal $true $state.frontendEnabled 'Starting backend should preserve frontend state'
    Assert-Equal $true $state.backendEnabled 'Starting backend should enable backend'

    $state = Set-SupervisedServiceState -RepositoryRoot $firstRepository -Scope frontend -Enabled $false -MissingStateDefault $true -StateRoot $stateRoot
    Assert-Equal $false $state.frontendEnabled 'Stopping frontend should disable frontend'
    Assert-Equal $true $state.backendEnabled 'Stopping frontend should preserve backend state'

    $state = Set-SupervisedServiceState -RepositoryRoot $firstRepository -Scope all -Enabled $false -MissingStateDefault $true -StateRoot $stateRoot
    Assert-Equal $false $state.frontendEnabled 'Stopping all should disable frontend'
    Assert-Equal $false $state.backendEnabled 'Stopping all should disable backend'

    $firstPath = Get-SupervisedServiceStatePath -RepositoryRoot $firstRepository -StateRoot $stateRoot
    $secondPath = Get-SupervisedServiceStatePath -RepositoryRoot $secondRepository -StateRoot $stateRoot
    if ($firstPath -eq $secondPath) { throw 'Different repositories must use different state files.' }

    Write-Host '[supervisor-state-test] PASS'
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
