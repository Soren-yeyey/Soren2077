[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,

    [Parameter(Mandatory = $true)]
    [string]$PublicUrl,

    [string[]]$RequiredPath = @('/'),

    [string]$OutputPath,

    [double]$SingleImageLimitMB = 1,

    [double]$ImageTotalLimitMB = 5,

    [double]$ReleaseAssetLimitMB = 5,

    [int]$TimeoutSeconds = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-ToAbsolutePath {
    param([string]$BasePath, [string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Format-Bytes {
    param([long]$Bytes)

    if ($Bytes -ge 1MB) {
        return ('{0:N2} MB' -f ($Bytes / 1MB))
    }
    if ($Bytes -ge 1KB) {
        return ('{0:N1} KB' -f ($Bytes / 1KB))
    }
    return "$Bytes B"
}

function Add-Result {
    param(
        [System.Collections.Generic.List[object]]$List,
        [string]$Name,
        [ValidateSet('通过', '失败', '阻断')]
        [string]$Status,
        [string]$Details,
        [string[]]$Evidence = @()
    )

    $List.Add([pscustomobject]@{
        Name = $Name
        Status = $Status
        Details = $Details
        Evidence = @($Evidence)
    })
}

function Get-RelativeDisplayPath {
    param([string]$Root, [string]$FullPath)

    $rootUri = [Uri]((Resolve-Path -LiteralPath $Root).Path.TrimEnd('\') + '\')
    $fileUri = [Uri]$FullPath
    return [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($fileUri).ToString()).Replace('/', '\')
}

function Get-HttpCheck {
    param([Uri]$Uri, [int]$Timeout)

    try {
        $response = Invoke-WebRequest -Uri $Uri.AbsoluteUri -Method Get -UseBasicParsing -TimeoutSec $Timeout -MaximumRedirection 5
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Error = $null }
    }
    catch {
        $statusCode = $null
        $responseProperty = $_.Exception.PSObject.Properties['Response']
        if ($null -ne $responseProperty -and $null -ne $responseProperty.Value) {
            $statusProperty = $responseProperty.Value.PSObject.Properties['StatusCode']
            if ($null -ne $statusProperty -and $null -ne $statusProperty.Value) {
                $statusCode = [int]$statusProperty.Value
            }
        }
        return [pscustomobject]@{ Status = $statusCode; Error = $_.Exception.Message }
    }
}

function Resolve-ReferencePath {
    param([string]$BaseDirectory, [string]$Reference)

    $clean = ($Reference -split '[?#]', 2)[0]
    if ([string]::IsNullOrWhiteSpace($clean)) {
        return $null
    }
    if ($clean -match '^(?:[a-z]+:|//|#)' -or $clean.StartsWith('data:')) {
        return $null
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BaseDirectory ($clean.Replace('/', '\'))))
}

try {
    $root = (Resolve-Path -LiteralPath $ProjectRoot).Path
}
catch {
    Write-Error "项目目录不存在：$ProjectRoot"
    exit 2
}

try {
    $baseUri = [Uri]$PublicUrl
    if (-not $baseUri.IsAbsoluteUri -or $baseUri.Scheme -notin @('http', 'https')) {
        throw '公网地址必须是绝对 HTTP 或 HTTPS 地址。'
    }
}
catch {
    Write-Error "公网地址无效：$PublicUrl"
    exit 2
}

$results = New-Object 'System.Collections.Generic.List[object]'

# 1. Public reachability
$publicEvidence = New-Object 'System.Collections.Generic.List[string]'
$publicFailures = 0
$publicBlocked = 0
foreach ($path in $RequiredPath) {
    $relativePath = $path.TrimStart('/')
    $target = if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $baseUri
    }
    else {
        [Uri]::new($baseUri, $relativePath)
    }
    $http = Get-HttpCheck -Uri $target -Timeout $TimeoutSeconds
    if ($null -ne $http.Status) {
        $publicEvidence.Add("$($target.AbsoluteUri) -> HTTP $($http.Status)")
        if ($http.Status -lt 200 -or $http.Status -ge 400) {
            $publicFailures++
        }
    }
    else {
        $publicEvidence.Add("$($target.AbsoluteUri) -> 无法验证：$($http.Error)")
        $publicBlocked++
    }
}

if ($publicFailures -gt 0) {
    Add-Result -List $results -Name '公网可访问性' -Status '失败' -Details "$publicFailures 个必需页面未返回成功状态。" -Evidence $publicEvidence
}
elseif ($publicBlocked -gt 0) {
    Add-Result -List $results -Name '公网可访问性' -Status '阻断' -Details "$publicBlocked 个必需页面无法完成网络验证。" -Evidence $publicEvidence
}
else {
    Add-Result -List $results -Name '公网可访问性' -Status '通过' -Details "已验证 $($RequiredPath.Count) 个公网入口。" -Evidence $publicEvidence
}

# 2. Local static references
$missingReferences = New-Object 'System.Collections.Generic.HashSet[string]'
$referenceCount = 0
$htmlFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.html' | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' })
$cssFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.css' | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' })
$scriptFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.Extension -in @('.js', '.cjs', '.mjs', '.html') -and $_.FullName -notmatch '[\\/]\.git[\\/]' })

foreach ($file in $htmlFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($match in [regex]::Matches($content, '(?i)(?:src|href)\s*=\s*["''](?<ref>[^"''#]+)["'']')) {
        $resolved = Resolve-ReferencePath -BaseDirectory $file.DirectoryName -Reference $match.Groups['ref'].Value
        if ($null -eq $resolved) { continue }
        $referenceCount++
        if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
            $null = $missingReferences.Add("$(Get-RelativeDisplayPath -Root $root -FullPath $file.FullName) -> $($match.Groups['ref'].Value)")
        }
    }
}

foreach ($file in $cssFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($match in [regex]::Matches($content, '(?i)url\(\s*["'']?(?<ref>[^)"'']+)["'']?\s*\)')) {
        $resolved = Resolve-ReferencePath -BaseDirectory $file.DirectoryName -Reference $match.Groups['ref'].Value.Trim()
        if ($null -eq $resolved) { continue }
        $referenceCount++
        if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
            $null = $missingReferences.Add("$(Get-RelativeDisplayPath -Root $root -FullPath $file.FullName) -> $($match.Groups['ref'].Value)")
        }
    }
}

$assetLiteralPattern = '(?<ref>(?:images|models|libs|data|studio)/[A-Za-z0-9._/\\-]+\.(?:png|jpe?g|webp|gif|svg|glb|gltf|mp3|ogg|wav|json|css|js))'
foreach ($file in $scriptFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($match in [regex]::Matches($content, $assetLiteralPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        $resolved = Resolve-ReferencePath -BaseDirectory $root -Reference $match.Groups['ref'].Value
        if ($null -eq $resolved) { continue }
        $referenceCount++
        if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
            $null = $missingReferences.Add("$(Get-RelativeDisplayPath -Root $root -FullPath $file.FullName) -> $($match.Groups['ref'].Value)")
        }
    }
}

if ($missingReferences.Count -gt 0) {
    Add-Result -List $results -Name '本地资源引用' -Status '失败' -Details "发现 $($missingReferences.Count) 个缺失引用。" -Evidence @($missingReferences | Sort-Object)
}
else {
    Add-Result -List $results -Name '本地资源引用' -Status '通过' -Details "已检查 $referenceCount 条静态资源引用。"
}

# 3. Secret scan (only files that Git could include)
$candidateFiles = @()
$gitAvailable = $false
try {
    $gitOutput = @(& git -C $root ls-files --cached --others --exclude-standard 2>$null)
    if ($LASTEXITCODE -eq 0) {
        $gitAvailable = $true
        $candidateFiles = @($gitOutput | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    }
}
catch {
    $gitAvailable = $false
}

if (-not $gitAvailable) {
    Add-Result -List $results -Name '密钥泄露' -Status '阻断' -Details '无法读取 Git 文件清单，未执行密钥检查。'
}
else {
    $textExtensions = @('.txt', '.md', '.html', '.css', '.js', '.cjs', '.mjs', '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.cfg', '.conf', '.ps1', '.sh', '.py', '.env', '.example')
    $secretPatterns = @(
        @{ Name = '私钥'; Pattern = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----' },
        @{ Name = 'OpenAI 密钥'; Pattern = '\bsk-[A-Za-z0-9_-]{20,}\b' },
        @{ Name = 'GitHub 令牌'; Pattern = '\bgh[pousr]_[A-Za-z0-9]{20,}\b' },
        @{ Name = 'AWS 访问密钥'; Pattern = '\bAKIA[0-9A-Z]{16}\b' },
        @{ Name = '疑似明文凭据'; Pattern = '(?i)\b(?:api[_-]?key|access[_-]?token|secret|password)\b\s*[:=]\s*["'']?[A-Za-z0-9_./+=-]{16,}' }
    )
    $secretHits = New-Object 'System.Collections.Generic.List[string]'
    $scannedTextFiles = 0

    foreach ($filePath in $candidateFiles) {
        $item = Get-Item -LiteralPath $filePath
        $extension = $item.Extension.ToLowerInvariant()
        if ($textExtensions -notcontains $extension -and $item.Name -notmatch '^\.env(?:\.|$)') { continue }
        if ($item.Length -gt 2MB) { continue }

        try {
            $lines = @(Get-Content -LiteralPath $item.FullName -ErrorAction Stop)
            $scannedTextFiles++
            for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
                foreach ($definition in $secretPatterns) {
                    if ($lines[$lineIndex] -match $definition.Pattern) {
                        $relative = Get-RelativeDisplayPath -Root $root -FullPath $item.FullName
                        $secretHits.Add("${relative}:$($lineIndex + 1) [$($definition.Name)，内容已隐藏]")
                    }
                }
            }
        }
        catch {
            # A text candidate that cannot be decoded is skipped; binaries are outside this check.
        }
    }

    if ($secretHits.Count -gt 0) {
        Add-Result -List $results -Name '密钥泄露' -Status '失败' -Details "发现 $($secretHits.Count) 个疑似明文凭据。" -Evidence @($secretHits | Sort-Object -Unique)
    }
    else {
        Add-Result -List $results -Name '密钥泄露' -Status '通过' -Details "已检查 $scannedTextFiles 个可提交文本文件，未发现已知密钥模式。"
    }
}

# 4. Image budget
$imageExtensions = @('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg')
$allFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' })
$images = @($allFiles | Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() })
$imageBytes = [long](($images | Measure-Object -Property Length -Sum).Sum)
$singleImageLimitBytes = [long]($SingleImageLimitMB * 1MB)
$imageTotalLimitBytes = [long]($ImageTotalLimitMB * 1MB)
$oversizedImages = @($images | Where-Object { $_.Length -gt $singleImageLimitBytes } | Sort-Object Length -Descending)
$imageEvidence = New-Object 'System.Collections.Generic.List[string]'
$imageEvidence.Add("图片总量：$(Format-Bytes $imageBytes) / $(Format-Bytes $imageTotalLimitBytes)")
foreach ($image in $oversizedImages) {
    $imageEvidence.Add("$(Get-RelativeDisplayPath -Root $root -FullPath $image.FullName)：$(Format-Bytes $image.Length)")
}

if ($oversizedImages.Count -gt 0 -or $imageBytes -gt $imageTotalLimitBytes) {
    Add-Result -List $results -Name '图片预算' -Status '失败' -Details "共 $($images.Count) 张图片；$($oversizedImages.Count) 张超过单图限制。" -Evidence $imageEvidence
}
else {
    Add-Result -List $results -Name '图片预算' -Status '通过' -Details "共 $($images.Count) 张图片，单张与总量均在预算内。" -Evidence $imageEvidence
}

# 5. Total release asset budget
$releaseExtensions = @('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.glb', '.gltf', '.bin', '.mp3', '.ogg', '.wav', '.m4a', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf')
$releaseAssets = @($allFiles | Where-Object { $releaseExtensions -contains $_.Extension.ToLowerInvariant() })
$releaseBytes = [long](($releaseAssets | Measure-Object -Property Length -Sum).Sum)
$releaseLimitBytes = [long]($ReleaseAssetLimitMB * 1MB)
$largestAssets = @($releaseAssets | Sort-Object Length -Descending | Select-Object -First 8)
$releaseEvidence = New-Object 'System.Collections.Generic.List[string]'
$releaseEvidence.Add("发布素材总量：$(Format-Bytes $releaseBytes) / $(Format-Bytes $releaseLimitBytes)")
foreach ($asset in $largestAssets) {
    $releaseEvidence.Add("$(Get-RelativeDisplayPath -Root $root -FullPath $asset.FullName)：$(Format-Bytes $asset.Length)")
}

if ($releaseBytes -gt $releaseLimitBytes) {
    Add-Result -List $results -Name '发布素材预算' -Status '失败' -Details "发布素材总量超过预算 $(Format-Bytes ($releaseBytes - $releaseLimitBytes))。" -Evidence $releaseEvidence
}
else {
    Add-Result -List $results -Name '发布素材预算' -Status '通过' -Details "共 $($releaseAssets.Count) 个发布素材，总量在预算内。" -Evidence $releaseEvidence
}

$failedCount = @($results | Where-Object { $_.Status -eq '失败' }).Count
$blockedCount = @($results | Where-Object { $_.Status -eq '阻断' }).Count
$passedCount = @($results | Where-Object { $_.Status -eq '通过' }).Count
$overall = if ($blockedCount -gt 0) { '阻断' } elseif ($failedCount -gt 0) { '失败' } else { '通过' }
$exitCode = if ($blockedCount -gt 0) { 2 } elseif ($failedCount -gt 0) { 1 } else { 0 }

$reportLines = New-Object 'System.Collections.Generic.List[string]'
$reportLines.Add('# 发布前检查报告')
$reportLines.Add('')
$reportLines.Add("- 检查时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$reportLines.Add("- 项目目录：$root")
$reportLines.Add("- 公网地址：$($baseUri.AbsoluteUri)")
$reportLines.Add("- 总体结果：**$overall**")
$reportLines.Add("- 汇总：通过 $passedCount / 失败 $failedCount / 阻断 $blockedCount")
$reportLines.Add('')
$reportLines.Add('| 检查项 | 状态 | 结果 |')
$reportLines.Add('| --- | --- | --- |')
foreach ($result in $results) {
    $safeDetails = $result.Details.Replace('|', '\|')
    $reportLines.Add("| $($result.Name) | $($result.Status) | $safeDetails |")
}
$reportLines.Add('')
$reportLines.Add('## 证据')
foreach ($result in $results) {
    $reportLines.Add('')
    $reportLines.Add("### $($result.Name) · $($result.Status)")
    $reportLines.Add('')
    $reportLines.Add($result.Details)
    foreach ($entry in $result.Evidence) {
        $reportLines.Add("- $entry")
    }
}
$reportLines.Add('')
$reportLines.Add('> 退出码：0=全部通过，1=存在失败，2=存在无法验证的阻断项。')

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $resolvedOutput = Convert-ToAbsolutePath -BasePath $root -Path $OutputPath
    $outputDirectory = Split-Path -Parent $resolvedOutput
    if (-not (Test-Path -LiteralPath $outputDirectory)) {
        $null = New-Item -ItemType Directory -Path $outputDirectory -Force
    }
    $reportLines | Set-Content -LiteralPath $resolvedOutput -Encoding UTF8
    Write-Host "报告：$resolvedOutput"
}

Write-Host ''
Write-Host '发布前检查'
foreach ($result in $results) {
    $prefix = switch ($result.Status) {
        '通过' { '[通过]' }
        '失败' { '[失败]' }
        default { '[阻断]' }
    }
    Write-Host "$prefix $($result.Name)：$($result.Details)"
    foreach ($entry in $result.Evidence) {
        Write-Host "  - $entry"
    }
}
Write-Host ''
Write-Host "总体结果：$overall（通过 $passedCount / 失败 $failedCount / 阻断 $blockedCount）"

exit $exitCode
