[CmdletBinding()]
param(
    [switch]$CheckOnly
)

$tools = @(
    @{ Name = 'Git';          Cmd = 'git';      Args = @('--version'); Install = @{ Type = 'winget'; Id = 'Git.Git' } },
    @{ Name = 'PowerShell 7'; Cmd = 'pwsh';     Args = @('--version'); Install = @{ Type = 'winget'; Id = 'Microsoft.PowerShell' } },
    @{ Name = 'Git Bash';     Cmd = 'bash';     Args = @('--version'); Paths = @("$env:ProgramFiles\Git\bin\bash.exe", "${env:ProgramFiles(x86)}\Git\bin\bash.exe"); Install = @{ Type = 'winget'; Id = 'Git.Git' } },
    @{ Name = 'Node.js';      Cmd = 'node';     Args = @('--version') },
    @{ Name = 'npm';          Cmd = 'npm';      Args = @('--version') },
    @{ Name = 'pnpm';         Cmd = 'pnpm';     Args = @('--version'); Install = @{ Type = 'npm'; Package = 'pnpm' } },
    @{ Name = 'Python';       Cmd = 'python';   Args = @('--version') },
    @{ Name = 'Java';         Cmd = 'java';     Args = @('-version') },
    @{ Name = 'JDK 21';       Cmd = 'javac';    Args = @('-version'); RequiredMajor = 21; Install = @{ Type = 'winget'; Id = 'Microsoft.OpenJDK.21' }; VersionSensitive = $true },
    @{ Name = 'Maven';        Cmd = 'mvn';      Args = @('--version'); Install = @{ Type = 'choco'; Package = 'maven' }; VersionSensitive = $true },
    @{ Name = 'Gradle';       Cmd = 'gradle';   Args = @('--version'); Install = @{ Type = 'choco'; Package = 'gradle' }; VersionSensitive = $true },
    @{ Name = 'Docker';       Cmd = 'docker';   Args = @('--version'); Paths = @("$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"); Install = @{ Type = 'winget'; Id = 'Docker.DockerDesktop' } },
    @{ Name = 'GitHub CLI';   Cmd = 'gh';       Args = @('--version'); Install = @{ Type = 'winget'; Id = 'GitHub.cli' } },
    @{ Name = 'ripgrep';      Cmd = 'rg';       Args = @('--version'); Install = @{ Type = 'winget'; Id = 'BurntSushi.ripgrep.MSVC' } },
    @{ Name = 'fd';           Cmd = 'fd';       Args = @('--version'); Install = @{ Type = 'winget'; Id = 'sharkdp.fd' } },
    @{ Name = 'jq';           Cmd = 'jq';       Args = @('--version'); Install = @{ Type = 'winget'; Id = 'jqlang.jq' } },
    @{ Name = 'curl';         Cmd = 'curl.exe'; Args = @('--version') },
    @{ Name = '7-Zip';        Cmd = '7z';       Args = @(); Paths = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe"); Install = @{ Type = 'winget'; Id = '7zip.7zip' } }
)

function Find-Jdk21Command {
    $candidates = @()
    $pathCommand = Get-Command javac -ErrorAction SilentlyContinue
    if ($pathCommand) {
        $candidates += $pathCommand.Source
    }

    foreach ($root in @("$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Eclipse Adoptium")) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) {
            continue
        }
        $candidates += Get-ChildItem -LiteralPath $root -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName 'bin\javac.exe' }
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            continue
        }
        $version = & $candidate -version 2>&1 | Select-Object -First 1
        if ([string]$version -match '^javac 21(?:\.|$)') {
            return $candidate
        }
    }

    return $null
}

function Resolve-ToolCommand($tool) {
    if ($tool.Name -eq 'JDK 21') {
        return Find-Jdk21Command
    }

    $command = Get-Command $tool.Cmd -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    if ($tool.Name -eq 'Git Bash') {
        $gitCommand = Get-Command git -ErrorAction SilentlyContinue
        if ($gitCommand) {
            $gitRoot = Split-Path -Parent (Split-Path -Parent $gitCommand.Source)
            $gitBash = Join-Path $gitRoot 'bin\bash.exe'
            if (Test-Path -LiteralPath $gitBash -PathType Leaf) {
                return $gitBash
            }
        }
    }

    foreach ($path in @($tool.Paths)) {
        if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) {
            return $path
        }
    }

    return $null
}

function Update-ProcessEnvironment {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:PATH = @($machinePath, $userPath, $env:PATH) -join ';'

    $jdkCommand = Find-Jdk21Command
    if ($jdkCommand) {
        $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $jdkCommand)
        $env:PATH = "$(Join-Path $env:JAVA_HOME 'bin');$env:PATH"
        Write-Host "  当前脚本已切换 JAVA_HOME：$env:JAVA_HOME" -ForegroundColor Green
    }
}

function Format-InstallCommand($tool) {
    switch ($tool.Install.Type) {
        'winget' { return "winget install --id $($tool.Install.Id) --exact --accept-package-agreements --accept-source-agreements" }
        'npm' { return "npm install --global $($tool.Install.Package)" }
        'choco' { return "choco install $($tool.Install.Package) --yes" }
        default { return $null }
    }
}

function Test-WingetPackageInstalled([string]$packageId) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        return $false
    }

    & winget list --id $packageId --exact --accept-source-agreements 1>$null 2>$null
    return $LASTEXITCODE -eq 0
}

function Resolve-ChocolateyCommand {
    $command = Get-Command choco -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $defaultPath = Join-Path $env:ProgramData 'chocolatey\bin\choco.exe'
    if (Test-Path -LiteralPath $defaultPath -PathType Leaf) {
        return $defaultPath
    }

    return $null
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-ChocolateyPackage([string]$chocolateyCommand, [string]$packageName) {
    $arguments = @('install', $packageName, '--yes', '--no-progress')
    if (Test-IsAdministrator) {
        Write-Host "  当前终端已有管理员权限，开始安装 $packageName..." -ForegroundColor Cyan
        & $chocolateyCommand $arguments
        return $LASTEXITCODE
    }

    Write-Host '  Chocolatey 需要写入系统目录，即将弹出 UAC 授权窗口。' -ForegroundColor Yellow
    Write-Host '  请在 Windows“用户账户控制”窗口中选择“是”。' -ForegroundColor Yellow
    try {
        $process = Start-Process `
            -FilePath $chocolateyCommand `
            -ArgumentList $arguments `
            -Verb RunAs `
            -PassThru
        Write-Host "  管理员安装进程已启动（PID=$($process.Id)），正在安装 $packageName..." -ForegroundColor Cyan

        $startedAt = Get-Date
        while (-not $process.HasExited) {
            $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
            Write-Progress `
                -Activity "正在安装 $packageName" `
                -Status "管理员进程 PID=$($process.Id)，已等待 $elapsed 秒" `
                -PercentComplete -1
            Start-Sleep -Seconds 1
            $process.Refresh()
        }
        Write-Progress -Activity "正在安装 $packageName" -Completed
        Write-Host "  管理员安装进程已结束，退出码：$($process.ExitCode)" -ForegroundColor Cyan
        return $process.ExitCode
    } catch {
        Write-Progress -Activity "正在安装 $packageName" -Completed
        Write-Host "  未能启动管理员安装进程：$($_.Exception.Message)" -ForegroundColor Red
        return 1
    }
}

function Install-Chocolatey {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host '  无法安装 Chocolatey：未找到 winget。' -ForegroundColor Red
        return $null
    }

    Write-Host '  未找到 Chocolatey，将先通过 winget 安装 Chocolatey。' -ForegroundColor Yellow
    & winget install --id Chocolatey.Chocolatey --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Chocolatey 安装失败，退出码：$LASTEXITCODE" -ForegroundColor Red
        return $null
    }

    $chocolateyCommand = Resolve-ChocolateyCommand
    if (-not $chocolateyCommand) {
        Write-Host '  Chocolatey 已安装，但当前终端尚未识别；请重新打开终端后再次运行脚本。' -ForegroundColor Yellow
        return $null
    }

    Write-Host '  Chocolatey 安装成功，继续安装目标工具。' -ForegroundColor Green
    return $chocolateyCommand
}

function Install-Tool($tool) {
    $installExitCode = 1
    switch ($tool.Install.Type) {
        'winget' {
            if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
                Write-Host '  无法安装：未找到 winget，请先从 Microsoft Store 安装“应用安装程序”。' -ForegroundColor Red
                return
            }
            if (Test-WingetPackageInstalled $tool.Install.Id) {
                Write-Host "  winget 已确认 $($tool.Name) 安装存在，无需重复安装。" -ForegroundColor Green
                Update-ProcessEnvironment
                $installExitCode = 0
                break
            }
            & winget install --id $tool.Install.Id --exact --accept-package-agreements --accept-source-agreements
            $installExitCode = $LASTEXITCODE
            if ($installExitCode -eq 0) {
                Update-ProcessEnvironment
            }
        }
        'npm' {
            if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
                Write-Host '  无法安装：未找到 npm，请先安装 Node.js。' -ForegroundColor Red
                return
            }
            & npm install --global $tool.Install.Package
            $installExitCode = $LASTEXITCODE
        }
        'choco' {
            $chocolateyCommand = Resolve-ChocolateyCommand
            if (-not $chocolateyCommand) {
                $chocolateyCommand = Install-Chocolatey
            }
            if (-not $chocolateyCommand) {
                return
            }
            $installExitCode = Install-ChocolateyPackage $chocolateyCommand $tool.Install.Package
            if ($installExitCode -ne 0) {
                Write-Host '  若仍提示锁文件被占用，请先关闭其他 Chocolatey/NuGet 安装进程后重试。' -ForegroundColor Yellow
            }
        }
    }

    if ($installExitCode -eq 0) {
        Write-Host "  $($tool.Name) 安装命令执行成功；若仍无法识别，请重新打开终端。" -ForegroundColor Green
    } else {
        Write-Host "  $($tool.Name) 安装失败，退出码：$installExitCode" -ForegroundColor Red
    }
}

$missing = @()

Write-Host ''
Write-Host '========== Agent 开发环境检查 ==========' -ForegroundColor Cyan
Write-Host ''

foreach ($tool in $tools) {
    $command = Resolve-ToolCommand $tool

    if ($command) {
        try {
            $output = if ($tool.Args.Count -gt 0) {
                & $command $tool.Args 2>&1 | Select-Object -First 1
            } else {
                'Installed'
            }

            Write-Host ('[OK]      {0,-16} {1}' -f $tool.Name, $output) -ForegroundColor Green
        } catch {
            Write-Host ('[WARN]    {0,-16} 命令存在，但执行异常' -f $tool.Name) -ForegroundColor Yellow
        }
    } else {
        if ($tool.Install.Type -eq 'winget' -and (Test-WingetPackageInstalled $tool.Install.Id)) {
            Write-Host ('[WARN]    {0,-16} 已安装，但命令未加入 PATH' -f $tool.Name) -ForegroundColor Yellow
        } else {
            Write-Host ('[MISSING] {0,-16}' -f $tool.Name) -ForegroundColor Red
            $missing += $tool
        }
    }
}

Write-Host ''
Write-Host '========== 环境变量 ==========' -ForegroundColor Cyan
Write-Host ''
Write-Host "OS           : $([System.Environment]::OSVersion.VersionString)"
Write-Host "Architecture : $env:PROCESSOR_ARCHITECTURE"
Write-Host "Shell        : PowerShell $($PSVersionTable.PSVersion)"
Write-Host "JAVA_HOME    : $env:JAVA_HOME"
Write-Host "PATH entries : $(($env:PATH -split ';').Count)"

Write-Host ''
Write-Host '========== 检查结果 ==========' -ForegroundColor Cyan
Write-Host ''

if ($missing.Count -eq 0) {
    Write-Host '全部工具已安装。' -ForegroundColor Green
} else {
    Write-Host '缺少以下工具：' -ForegroundColor Yellow

    foreach ($tool in $missing) {
        Write-Host "  - $($tool.Name)" -ForegroundColor Red
    }
}

Write-Host ''

if ($missing.Count -gt 0 -and -not $CheckOnly) {
    Write-Host '========== 逐项安装 ==========' -ForegroundColor Cyan
    Write-Host '直接回车安装，输入 n 跳过。安装过程可能触发管理员授权。' -ForegroundColor Yellow
    Write-Host ''

    foreach ($tool in $missing) {
        $installCommand = Format-InstallCommand $tool
        if (-not $installCommand) {
            continue
        }

        Write-Host "$($tool.Name)：$installCommand" -ForegroundColor Cyan
        if ($tool.VersionSensitive) {
            Write-Host '  注意：该工具有项目版本约束，请确认当前项目需要此全局版本。' -ForegroundColor Yellow
        }

        $answer = Read-Host '  是否安装？[Enter=安装 / n=跳过]'
        if ($answer.Trim().ToLowerInvariant() -eq 'n') {
            Write-Host '  已跳过。' -ForegroundColor DarkGray
        } else {
            Write-Host "  已确认安装 $($tool.Name)，正在准备安装命令..." -ForegroundColor Cyan
            Install-Tool $tool
        }
        Write-Host ''
    }
}
