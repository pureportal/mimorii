param(
    [Parameter(Mandatory = $true)]
    [string]$BaseMsi,
    [Parameter(Mandatory = $true)]
    [string]$UpgradeMsi,
    [Parameter(Mandatory = $true)]
    [string]$ReinstallMsi,
    [Parameter(Mandatory = $true)]
    [string]$AgentExecutable
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$serviceName = "MimoriiAgent"
$legacyTaskName = "Mimorii Agent Desktop"
$installDirectory = "C:\Program Files\Mimorii Agent"
$dataDirectory = "C:\ProgramData\Mimorii\Agent"
$shortcut = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Mimorii\Mimorii Agent.lnk"
$serverJob = $null

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-Installer {
    param([string[]]$Arguments, [string]$Operation)
    $log = Join-Path $env:TEMP "mimorii-agent-$($Operation.ToLowerInvariant()).log"
    $process = Start-Process msiexec.exe -ArgumentList ($Arguments + @("/qn", "/norestart", "/l*vx", "`"$log`"")) -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) {
        $tail = Get-Content $log -Tail 120 -ErrorAction SilentlyContinue
        throw "$Operation failed with exit code $($process.ExitCode).`n$($tail -join "`n")"
    }
}

function Get-AgentPathEntries {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    @($machinePath -split ";" | Where-Object { $_.TrimEnd("\") -ieq $installDirectory })
}

function Get-ServiceRecord {
    Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
}

function Get-InstalledProductCodes {
    @(
        Get-ChildItem "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
            Where-Object { $_.GetValue("DisplayName") -eq "Mimorii Agent" -and $_.PSChildName -match "^\{[0-9A-F-]+\}$" } |
            Select-Object -ExpandProperty PSChildName
    )
}

function Test-LegacyTask {
    $task = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
    $null -ne $task
}

function Assert-Installed {
    $service = Get-ServiceRecord
    Assert-True ($null -ne $service) "The Windows service is missing"
    Assert-True ($service.State -eq "Running") "The Windows service is not running"
    Assert-True ($service.StartMode -eq "Auto") "The Windows service is not automatic"
    Assert-True ($service.StartName -eq "NT SERVICE\MimoriiAgent") "The Windows service account is incorrect"
    Assert-True ($service.PathName -match "windows-service$") "The Windows service command is incorrect"
    Assert-True (@(Get-Process mimorii-agent-desktop -ErrorAction SilentlyContinue).Count -eq 1) "The agent process count is not one"
    Assert-True (@(Get-AgentPathEntries).Count -eq 1) "The machine PATH entry count is not one"
    Assert-True (Test-Path (Join-Path $installDirectory "mimorii-agent-desktop.exe")) "The CLI executable is missing"
    Assert-True (Test-Path (Join-Path $installDirectory "mimorii-agent-desktop-ui.exe")) "The Agent UI executable is missing"
    Assert-True (Test-Path $shortcut) "The Agent UI Start menu shortcut is missing"
    Assert-True (-not (Test-LegacyTask)) "The legacy startup task still exists"
    $acl = (Get-Acl $dataDirectory).Sddl
    Assert-True ($acl -match "S-1-5-80-3802376569-3136133371-2121416282-4072350139-2819318073") "The service account cannot access ProgramData"
    Assert-True ($acl -notmatch ";;;BU\)") "ProgramData is accessible to standard users"
}

function Wait-For {
    param([scriptblock]$Condition, [string]$Failure, [int]$TimeoutSeconds = 15)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (& $Condition) {
            return
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw $Failure
}

function Get-ServerEvents {
    if ($null -eq $serverJob) {
        return @()
    }
    @(Receive-Job $serverJob -Keep -ErrorAction Stop)
}

function Remove-TestInstallation {
    foreach ($productCode in @(Get-InstalledProductCodes)) {
        $process = Start-Process msiexec.exe -ArgumentList @("/x", $productCode, "/qn", "/norestart") -Wait -PassThru -WindowStyle Hidden
        if ($process.ExitCode -notin @(0, 1605, 1614)) {
            Write-Warning "Cleanup of $productCode returned $($process.ExitCode)"
        }
    }
    if (Test-LegacyTask) {
        schtasks.exe /Delete /F /TN $legacyTaskName | Out-Null
    }
    if (Test-Path $dataDirectory) {
        $resolved = [IO.Path]::GetFullPath($dataDirectory).TrimEnd("\")
        Assert-True ($resolved -eq "C:\ProgramData\Mimorii\Agent") "Refusing to clean an unexpected data directory"
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
Assert-True ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) "Installer tests require an administrator terminal"
$BaseMsi = (Resolve-Path $BaseMsi).Path
$UpgradeMsi = (Resolve-Path $UpgradeMsi).Path
$ReinstallMsi = (Resolve-Path $ReinstallMsi).Path
$AgentExecutable = (Resolve-Path $AgentExecutable).Path
Assert-True ($null -eq (Get-ServiceRecord)) "Mimorii Agent is already installed"
Assert-True (-not (Test-Path $dataDirectory)) "Mimorii Agent data already exists"
Assert-True (@(Get-AgentPathEntries).Count -eq 0) "Mimorii Agent is already on the machine PATH"

try {
    $taskCommand = "`"$AgentExecutable`" run"
    schtasks.exe /Create /F /SC ONLOGON /TN $legacyTaskName /TR $taskCommand /RL LIMITED | Out-Null
    schtasks.exe /Run /TN $legacyTaskName | Out-Null
    Wait-For { @(Get-Process mimorii-agent-desktop -ErrorAction SilentlyContinue).Count -eq 1 } "The legacy agent did not start"

    Invoke-Installer -Arguments @("/i", "`"$BaseMsi`"") -Operation "Install"
    Assert-Installed
    $cli = Join-Path $installDirectory "mimorii-agent-desktop.exe"

    $statusOutput = & $cli status
    Assert-True ($LASTEXITCODE -eq 0 -and $statusOutput -eq "service: running") "The CLI did not report the running service"
    $controlStatus = & $cli status --json | ConvertFrom-Json
    Assert-True ($controlStatus.service -eq "running" -and -not $controlStatus.enrolled) "The Agent UI status is incorrect before enrollment"

    & $cli windows-service-control stop
    Assert-True ($LASTEXITCODE -eq 0) "The Agent UI service stop failed"
    Wait-For { (Get-ServiceRecord).State -eq "Stopped" } "The service did not stop cleanly"
    Assert-True (@(Get-Process mimorii-agent-desktop -ErrorAction SilentlyContinue).Count -eq 0) "The controlled stop left an agent process"
    & $cli windows-service-control start
    Assert-True ($LASTEXITCODE -eq 0) "The Agent UI service start failed"
    Wait-For { (Get-ServiceRecord).State -eq "Running" } "The service did not start again"
    Assert-Installed

    $savedPath = $env:Path
    try {
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        $resolvedCli = (Get-Command mimorii-agent-desktop -CommandType Application).Source
        Assert-True ($resolvedCli -ieq (Join-Path $installDirectory "mimorii-agent-desktop.exe")) "The CLI is not available in a new terminal"
    } finally {
        $env:Path = $savedPath
    }

    $port = Get-Random -Minimum 42000 -Maximum 49000
    $serverJob = Start-Job -ArgumentList $port -ScriptBlock {
        param($Port)
        $listener = [Net.HttpListener]::new()
        $listener.Prefixes.Add("http://127.0.0.1:$Port/")
        $listener.Start()
        try {
            while ($true) {
                $context = $listener.GetContext()
                Write-Output "$($context.Request.HttpMethod) $($context.Request.RawUrl) $($context.Request.Headers['Authorization'])"
                $payload = [Text.Encoding]::UTF8.GetBytes('{"collectionIntervalSeconds":30,"collectHostTelemetry":false,"tasks":[]}')
                $context.Response.StatusCode = 200
                $context.Response.ContentType = "application/json"
                $context.Response.ContentLength64 = $payload.Length
                $context.Response.OutputStream.Write($payload, 0, $payload.Length)
                $context.Response.Close()
            }
        } finally {
            $listener.Stop()
        }
    }
    Start-Sleep -Milliseconds 500

    $firstKey = "mim_agent_" + ("a" * 32)
    $secondKey = "mim_agent_" + ("b" * 32)
    & $cli enroll --server "http://127.0.0.1:$port" --key $firstKey --allow-insecure-http
    Assert-True ($LASTEXITCODE -eq 0) "Enrollment failed"
    $controlStatus = & $cli status --json | ConvertFrom-Json
    Assert-True ($controlStatus.enrolled -and $controlStatus.serverUrl -eq "http://127.0.0.1:$port/api") "The Agent UI did not read enrollment state"
    Wait-For { (@(Get-ServerEvents | Where-Object { $_ -match "Bearer $firstKey" })).Count -ge 2 } "The running service did not apply enrollment"

    $servicePid = (Get-ServiceRecord).ProcessId
    & $cli configure --server "http://127.0.0.1:$port" --key $secondKey --allow-insecure-http
    Assert-True ($LASTEXITCODE -eq 0) "Configuration update failed"
    Wait-For { (@(Get-ServerEvents | Where-Object { $_ -match "Bearer $secondKey" })).Count -ge 1 } "The running service did not apply the configuration update"
    Assert-True ((Get-ServiceRecord).ProcessId -eq $servicePid) "The service restarted while applying configuration"

    $secondKeyRequests = (@(Get-ServerEvents | Where-Object { $_ -match "Bearer $secondKey" })).Count
    $rejectionCount = ([regex]::Matches((Get-Content (Join-Path $dataDirectory "agent-desktop.log") -Raw), "configuration update rejected")).Count
    Set-Content -LiteralPath (Join-Path $dataDirectory "agent-desktop.json") -Value "invalid"
    Wait-For { ([regex]::Matches((Get-Content (Join-Path $dataDirectory "agent-desktop.log") -Raw), "configuration update rejected")).Count -gt $rejectionCount } "The rejected configuration was not reported"
    Wait-For { (@(Get-ServerEvents | Where-Object { $_ -match "Bearer $secondKey" })).Count -gt $secondKeyRequests } "The service did not retain the active configuration" 40
    & $cli configure --server "http://127.0.0.1:$port" --key $secondKey --allow-insecure-http
    Assert-True ($LASTEXITCODE -eq 0) "Configuration recovery failed"

    $requestsBeforeRecovery = (@(Get-ServerEvents | Where-Object { $_ -match "Bearer $secondKey" })).Count
    $failedProcessId = (Get-ServiceRecord).ProcessId
    Stop-Process -Id $failedProcessId -Force
    Wait-For {
        $recovered = Get-ServiceRecord
        $recovered.State -eq "Running" -and $recovered.ProcessId -ne $failedProcessId
    } "The service did not recover from process failure" 25
    Assert-Installed
    Wait-For { (@(Get-ServerEvents | Where-Object { $_ -match "Bearer $secondKey" })).Count -gt $requestsBeforeRecovery } "The recovered service did not retain configuration" 40

    $configPath = Join-Path $dataDirectory "agent-desktop.json"
    $configHash = (Get-FileHash $configPath -Algorithm SHA256).Hash
    Invoke-Installer -Arguments @("/i", "`"$UpgradeMsi`"") -Operation "Upgrade"
    Assert-Installed
    Assert-True ((Get-FileHash $configPath -Algorithm SHA256).Hash -eq $configHash) "Upgrade changed the agent configuration"

    Invoke-Installer -Arguments @("/i", "`"$ReinstallMsi`"", "REINSTALL=ALL", "REINSTALLMODE=vomus") -Operation "Reinstall"
    Assert-Installed
    Assert-True ((Get-FileHash $configPath -Algorithm SHA256).Hash -eq $configHash) "Reinstallation changed the agent configuration"

    $productCodes = @(Get-InstalledProductCodes)
    Assert-True ($productCodes.Count -eq 1) "The installed product registration is not unique"
    Invoke-Installer -Arguments @("/x", $productCodes[0]) -Operation "Uninstall"
    Assert-True ($null -eq (Get-ServiceRecord)) "Uninstall left the Windows service"
    Assert-True (@(Get-Process mimorii-agent-desktop -ErrorAction SilentlyContinue).Count -eq 0) "Uninstall left an agent process"
    Assert-True (@(Get-AgentPathEntries).Count -eq 0) "Uninstall left a machine PATH entry"
    Assert-True (-not (Test-Path $installDirectory)) "Uninstall left the installation directory"
    Assert-True (-not (Test-Path $dataDirectory)) "Uninstall left agent data"
    Assert-True (-not (Test-Path $shortcut)) "Uninstall left the Agent UI shortcut"
    Write-Output "Windows installer lifecycle passed"
} finally {
    if ($null -ne $serverJob) {
        Stop-Job $serverJob -ErrorAction SilentlyContinue
        Remove-Job $serverJob -Force -ErrorAction SilentlyContinue
    }
    Remove-TestInstallation
}
