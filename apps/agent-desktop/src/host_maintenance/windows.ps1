$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Assessment([string]$Name, [string]$Failure, [scriptblock]$Collect) {
    try {
        $data = & $Collect
        $result = @{ status = 'available'; data = $data }
    } catch {
        $result = @{ status = 'unavailable'; reason = $Failure }
    }
    [Console]::WriteLine((@{ check = $Name; result = $result } | ConvertTo-Json -Compress -Depth 6))
}

if ($env:MIMORII_ASSESS_REBOOT -eq '1') {
    Write-Assessment 'reboot' 'Restart state could not be read; check Windows Update access' {
        $required = (New-Object -ComObject Microsoft.Update.SystemInfo).RebootRequired
        $servicing = Test-Path -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'
        $examples = @()
        if ($required -or $servicing) { $examples = @('Windows requires a restart') }
        @{ count = $examples.Count; examples = $examples; unavailable = @() }
    }
}

if ($env:MIMORII_ASSESS_SECURITY -eq '1') {
    Write-Assessment 'security' 'Security state could not be read; check the agent account permissions' {
        $problems = [System.Collections.Generic.List[string]]::new()
        $unavailable = [System.Collections.Generic.List[string]]::new()
        try {
            $firewall = New-Object -ComObject HNetCfg.FwPolicy2
            $active = $firewall.CurrentProfileTypes
            if ($active -eq 0) { throw 'No active firewall profiles' }
            foreach ($profile in @(@{ id = 1; name = 'Domain' }, @{ id = 2; name = 'Private' }, @{ id = 4; name = 'Public' })) {
                if (($active -band $profile.id) -ne 0 -and -not $firewall.FirewallEnabled($profile.id)) {
                    $problems.Add("Windows Firewall is disabled: $($profile.name)")
                }
            }
        } catch {
            $unavailable.Add('Windows Firewall state could not be read')
        }
        try {
            $defender = Get-MpComputerStatus -ErrorAction Stop
            if ($defender.AMRunningMode -ne 'Normal') {
                $unavailable.Add('Defender is not the active antivirus; antivirus protection could not be assessed')
            } elseif (-not $defender.AMServiceEnabled -or -not $defender.AntivirusEnabled -or -not $defender.RealTimeProtectionEnabled) {
                $problems.Add('Microsoft Defender real-time protection is disabled')
            }
        } catch {
            $unavailable.Add('Microsoft Defender state could not be read')
        }
        @{ count = $problems.Count; examples = @($problems.ToArray()); unavailable = @($unavailable.ToArray()) }
    }
}

if ($env:MIMORII_ASSESS_SERVICES -eq '1') {
    Write-Assessment 'services' 'Service failures could not be read; check access to Windows service data' {
        $failed = @(Get-CimInstance -ClassName Win32_Service -Filter "StartMode = 'Auto' AND State = 'Stopped' AND ExitCode <> 0" -ErrorAction Stop)
        $examples = @($failed | Sort-Object Name | Select-Object -First 5 | ForEach-Object { "$($_.Name) (exit $($_.ExitCode))" })
        @{ count = $failed.Count; examples = $examples; unavailable = @() }
    }
}

if ($env:MIMORII_ASSESS_UPDATES -eq '1') {
    Write-Assessment 'updates' 'Windows Update data could not be read; check Windows Update and the agent account permissions' {
        $lastSearch = (New-Object -ComObject Microsoft.Update.AutoUpdate).Results.LastSearchSuccessDate
        $age = $null
        if ($null -ne $lastSearch -and $lastSearch.Year -gt 2000) {
            $age = ([DateTime]::UtcNow - [DateTime]::SpecifyKind($lastSearch, [DateTimeKind]::Utc)).TotalHours
        }
        $session = New-Object -ComObject Microsoft.Update.Session
        $session.ClientApplicationID = 'Mimorii host assessment'
        $searcher = $session.CreateUpdateSearcher()
        $searcher.Online = $false
        $search = $searcher.Search("IsInstalled = 0 and Type = 'Software'")
        if ($search.ResultCode -ne 2) { throw 'Incomplete update search' }
        $updates = @($search.Updates)
        $security = @($updates | Where-Object {
            $categories = @($_.Categories | ForEach-Object { $_.CategoryID })
            $categories -contains '0fa1201d-4330-4fa8-8ae9-b877473b6441' -or
            $categories -contains 'e6cf1350-c01b-414d-a61f-263d14d133b4' -or
            $_.MsrcSeverity -eq 'Critical'
        })
        @{
            count = $updates.Count
            securityCount = $security.Count
            examples = @($updates | Select-Object -First 5 | ForEach-Object { $_.Title })
            securityExamples = @($security | Select-Object -First 5 | ForEach-Object { $_.Title })
            dataAgeHours = $age
            unavailable = @()
        }
    }
}
