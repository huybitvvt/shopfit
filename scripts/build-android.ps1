param(
  [string]$ApiUrl = 'http://10.0.2.2:8000',
  [string]$Architectures = 'arm64-v8a,x86_64'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $projectRoot 'mobile'
$artifactsRoot = Join-Path $projectRoot 'artifacts'
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { throw 'Set JAVA_HOME to a compatible JDK (Android Studio JBR or JDK 17+).' }
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Set ANDROID_HOME to your installed Android SDK.' }
$env:SHOPFIT_PREVIEW = '1'
$env:EXPO_PUBLIC_API_URL = $ApiUrl
$env:CI = '1'
$env:NODE_ENV = 'production'
$env:CMAKE_BUILD_PARALLEL_LEVEL = '2'
New-Item -ItemType Directory -Path $artifactsRoot -Force | Out-Null
Push-Location -LiteralPath $mobileRoot
try {
  & npx.cmd expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
  Push-Location -LiteralPath (Join-Path $mobileRoot 'android')
  try {
    & .\gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architectures" --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m' '-Pkotlin.compiler.execution.strategy=in-process' '-Dorg.gradle.parallel=false' --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed.' }
  } finally { Pop-Location }
  $apkSource = Join-Path $mobileRoot 'android\app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path -LiteralPath $apkSource)) { throw 'Gradle did not produce the expected APK.' }
  $apkTarget = Join-Path $artifactsRoot 'ShopFit-preview.apk'
  Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force
  $hash = (Get-FileHash -LiteralPath $apkTarget -Algorithm SHA256).Hash
  @{ api_url=$ApiUrl; architectures=$Architectures; sha256=$hash; built_at_utc=[DateTime]::UtcNow.ToString('o'); signing='development only' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactsRoot 'android-build.json') -Encoding UTF8
  Write-Output "APK: $apkTarget"
  Write-Output "SHA256: $hash"
} finally { Pop-Location }
