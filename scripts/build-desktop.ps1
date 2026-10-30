param(
  [ValidateSet('All', 'OnlineInstaller', 'OfflineInstaller', 'Portable', 'PortableOffline')]
  [string]$Target = 'All'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $repositoryRoot 'src-tauri'
$releaseRoot = Join-Path $tauriRoot 'target\release'
$packageRoot = Join-Path $releaseRoot 'packages'
$nsisOutput = Join-Path $releaseRoot 'bundle\nsis\Legado 本地 TXT 阅读器_1.0.0_x64-setup.exe'
$appExecutable = Join-Path $releaseRoot 'legado-local-reader.exe'
$portableScript = Join-Path $tauriRoot 'nsis\portable-offline.nsi'
$runtimeCab = Join-Path $releaseRoot 'Microsoft.WebView2.FixedVersionRuntime.156.0.4314.56.x64.cab'
$runtimeCabUrl = 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/876df7fd-c9c1-4feb-8a51-a768caada6dd/Microsoft.WebView2.FixedVersionRuntime.156.0.4314.56.x64.cab'
$makensis = (Get-Command makensis.exe -ErrorAction Stop).Source

function Invoke-Pnpm {
  param([string[]]$Arguments)
  Push-Location $repositoryRoot
  try {
    & pnpm @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "构建命令失败，退出代码：$LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function New-PackageDirectory {
  param([string]$Name)
  $path = Join-Path $packageRoot $Name
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  return $path
}

function Build-OnlineInstaller {
  Invoke-Pnpm @('exec', 'tauri', 'build', '--config', 'src-tauri/tauri.online.conf.json')
  $destination = Join-Path (New-PackageDirectory 'online-installer') 'Legado-Web-Online-Setup.exe'
  Move-Item -LiteralPath $nsisOutput -Destination $destination -Force
}

function Build-OfflineInstaller {
  Invoke-Pnpm @('exec', 'tauri', 'build')
  $destination = Join-Path (New-PackageDirectory 'offline-installer') 'Legado-Web-Offline-Setup.exe'
  Move-Item -LiteralPath $nsisOutput -Destination $destination -Force
}

function Build-PortableExecutable {
  Invoke-Pnpm @('exec', 'tauri', 'build', '--no-bundle')
  $destination = Join-Path (New-PackageDirectory 'portable') 'Legado-Web-Portable.exe'
  Copy-Item -LiteralPath $appExecutable -Destination $destination -Force
}

function Ensure-FixedRuntimeCab {
  if ((Test-Path -LiteralPath $runtimeCab) -and (Get-Item -LiteralPath $runtimeCab).Length -gt 200000000) {
    return
  }

  $downloadPath = "$runtimeCab.download"
  if (Test-Path -LiteralPath $downloadPath) {
    Remove-Item -LiteralPath $downloadPath -Force
  }
  Write-Host '正在从 Microsoft 下载固定版 WebView2 CAB（约 310 MB）...'
  Invoke-WebRequest -Uri $runtimeCabUrl -OutFile $downloadPath
  if ((Get-Item -LiteralPath $downloadPath).Length -lt 200000000) {
    Remove-Item -LiteralPath $downloadPath -Force
    throw '下载的固定版 WebView2 CAB 文件不完整。'
  }
  Move-Item -LiteralPath $downloadPath -Destination $runtimeCab -Force
}

function Build-PortableOffline {
  Ensure-FixedRuntimeCab
  $runtimeConfigDirectory = Join-Path $tauriRoot 'webview2'
  $createdRuntimeConfigDirectory = -not (Test-Path -LiteralPath $runtimeConfigDirectory)
  if ($createdRuntimeConfigDirectory) {
    New-Item -ItemType Directory -Path $runtimeConfigDirectory | Out-Null
  }
  try {
    Invoke-Pnpm @('exec', 'tauri', 'build', '--no-bundle', '--config', 'src-tauri/tauri.portable-offline.conf.json')
  } finally {
    if ($createdRuntimeConfigDirectory) {
      Remove-Item -LiteralPath $runtimeConfigDirectory -Force
    }
  }
  if (-not (Test-Path -LiteralPath $makensis)) {
    throw "找不到 NSIS 编译器：$makensis"
  }
  $chunkDirectory = Join-Path $releaseRoot 'portable-offline-chunks'
  Remove-Item -LiteralPath $chunkDirectory -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $chunkDirectory -Force | Out-Null
  $chunkSize = 16MB
  $chunkNames = [System.Collections.Generic.List[string]]::new()
  $inputStream = [System.IO.File]::OpenRead($runtimeCab)
  try {
    $buffer = New-Object byte[] $chunkSize
    $index = 0
    while (($bytesRead = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $chunkPath = Join-Path $chunkDirectory ('webview2-fixed.{0:D2}.part' -f $index)
      $chunkNames.Add((Split-Path -Leaf $chunkPath))
      $outputStream = [System.IO.File]::Open($chunkPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
      try {
        $outputStream.Write($buffer, 0, $bytesRead)
      } finally {
        $outputStream.Dispose()
      }
      $index++
    }
  } finally {
    $inputStream.Dispose()
  }
  $includePath = Join-Path $chunkDirectory 'chunks.nsh'
  $includeContent = ($chunkNames | ForEach-Object { "  !insertmacro AddRuntimeChunk $_" }) -join "`r`n"
  [System.IO.File]::WriteAllText($includePath, $includeContent, [System.Text.UTF8Encoding]::new($false))
  $destination = Join-Path (New-PackageDirectory 'portable-offline') 'Legado-Web-Portable-Offline.exe'
  & $makensis /INPUTCHARSET UTF8 "/DAPP_EXE=$appExecutable" "/DWEBVIEW_CHUNKS=$chunkDirectory" "/DOUTPUT_FILE=$destination" $portableScript
  if ($LASTEXITCODE -ne 0) {
    throw "单文件便携版打包失败，退出代码：$LASTEXITCODE"
  }
}

switch ($Target) {
  'All' {
    Build-OnlineInstaller
    Build-OfflineInstaller
    Build-PortableExecutable
    Build-PortableOffline
  }
  'OnlineInstaller' { Build-OnlineInstaller }
  'OfflineInstaller' { Build-OfflineInstaller }
  'Portable' { Build-PortableExecutable }
  'PortableOffline' { Build-PortableOffline }
}

Write-Host "构建完成：$packageRoot"
