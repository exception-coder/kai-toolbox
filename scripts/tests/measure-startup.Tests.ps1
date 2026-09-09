$launcher = Join-Path (Split-Path -Parent $PSScriptRoot) 'measure-startup.ps1'
Describe 'Legacy measurement entry forwards to Node' {
    It 'preserves paths with spaces, options and the Node exit code' {
        function node { $global:measurementForwarded = @($args); $global:LASTEXITCODE = 17 }
        & $launcher -Port 19090 -TimeoutSeconds 15 -SkipBuild -TargetPath /api/tools -ApplicationJar 'C:/test path/app.jar' -OutputRoot 'C:/report path'
        $LASTEXITCODE | Should Be 17
        ($global:measurementForwarded -contains 'measure-startup') | Should Be $true
        ($global:measurementForwarded -contains '--skip-build') | Should Be $true
        ($global:measurementForwarded -contains 'C:/test path/app.jar') | Should Be $true
        ($global:measurementForwarded -contains 'C:/report path') | Should Be $true
        ($global:measurementForwarded -contains '19090') | Should Be $true
        Remove-Variable measurementForwarded -Scope Global
    }
}
