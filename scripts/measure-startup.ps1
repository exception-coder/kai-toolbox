# Compatibility entry; implementation lives in the portable Node CLI.
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
$cli = Join-Path (Split-Path -Parent $PSScriptRoot) 'forge.mjs'
$cliArguments = @($cli, 'measure-startup', '--port', "$Port", '--timeout-seconds', "$TimeoutSeconds")
if ($SkipBuild) { $cliArguments += '--skip-build' }
if ($TargetPath) { $cliArguments += @('--target-path', $TargetPath) }
if ($ApplicationJar) { $cliArguments += @('--application-jar', $ApplicationJar) }
if ($OutputRoot) { $cliArguments += @('--output-root', $OutputRoot) }
& node @cliArguments
exit $LASTEXITCODE
