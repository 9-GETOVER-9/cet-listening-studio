Set-StrictMode -Version Latest

function Assert-DeployArtifact {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$DistPath)

    $resolved = (Resolve-Path -LiteralPath $DistPath -ErrorAction Stop).Path
    foreach ($required in @('index.html', 'assets')) {
        if (-not (Test-Path -LiteralPath (Join-Path $resolved $required))) {
            throw "构建产物缺少必要项目: $required"
        }
    }
}

function New-DeployPackage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DistPath,
        [Parameter(Mandatory)][string]$PackagePath,
        [switch]$FrontendOnly,
        [string[]]$IncludeDataFile = @()
    )

    Assert-DeployArtifact -DistPath $DistPath
    $resolvedDist = (Resolve-Path -LiteralPath $DistPath).Path
    foreach ($name in $IncludeDataFile) {
        if ($name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.json$') { throw "Invalid selected JSON basename: $name" }
        $item = Get-Item -LiteralPath (Join-Path $resolvedDist "data\$name") -ErrorAction Stop
        $dataItem = Get-Item -LiteralPath (Join-Path $resolvedDist 'data') -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
            ($dataItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw "Selected data must be a regular file: $name" }
    }
    $staging = Join-Path ([System.IO.Path]::GetTempPath()) ("cet-release-" + [guid]::NewGuid())

    try {
        New-Item -ItemType Directory -Path $staging -Force | Out-Null
        Get-ChildItem -LiteralPath $resolvedDist -Force | Where-Object {
            $_.Name -ne 'data' -and (-not $FrontendOnly -or $_.Name -ne 'promo')
        } | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $staging -Recurse -Force
        }

        $distData = Join-Path $resolvedDist 'data'
        if ($FrontendOnly -and $IncludeDataFile.Count) {
            $stagingData = Join-Path $staging 'data'
            New-Item -ItemType Directory -Path $stagingData -Force | Out-Null
            foreach ($name in $IncludeDataFile) {
                Copy-Item -LiteralPath (Join-Path $distData $name) -Destination $stagingData -Force
            }
        }
        if (-not $FrontendOnly -and (Test-Path -LiteralPath $distData)) {
            $stagingData = Join-Path $staging 'data'
            New-Item -ItemType Directory -Path $stagingData -Force | Out-Null
            Get-ChildItem -LiteralPath $distData -Force | Where-Object {
                $_.Name -ne 'audio'
            } | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination $stagingData -Recurse -Force
            }
            if (-not (Get-ChildItem -LiteralPath $stagingData -Force)) {
                Remove-Item -LiteralPath $stagingData -Force
            }
        }

        $parent = Split-Path -Parent $PackagePath
        if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        if (Test-Path -LiteralPath $PackagePath) { Remove-Item -LiteralPath $PackagePath -Force }
        Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $PackagePath -CompressionLevel Optimal
    }
    finally {
        if (Test-Path -LiteralPath $staging) {
            $cleanupPath = (Resolve-Path -LiteralPath $staging).Path
            $tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
            if ((Split-Path -Parent $cleanupPath) -ne $tempParent -or
                (Split-Path -Leaf $cleanupPath) -notmatch '^cet-release-[0-9a-f-]{36}$') {
                throw "Refusing unexpected deployment cleanup path: $cleanupPath"
            }
            Remove-Item -LiteralPath $cleanupPath -Recurse -Force
        }
    }
}

Export-ModuleMember -Function Assert-DeployArtifact, New-DeployPackage
