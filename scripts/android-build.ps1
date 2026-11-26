$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"

if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\javac.exe"))) {
  $jdkHome = $env:JAVA_HOME
} else {
  $localJdk = Join-Path $projectRoot ".tools\jdk-17.0.19+10"
  $androidStudioJdk = "C:\Program Files\Android\Android Studio\jbr"

  if (Test-Path (Join-Path $localJdk "bin\javac.exe")) {
    $jdkHome = $localJdk
  } elseif (Test-Path (Join-Path $androidStudioJdk "bin\javac.exe")) {
    $jdkHome = $androidStudioJdk
  } else {
    throw "JDK not found. Install Android Studio or JDK 17, then set JAVA_HOME before running this script."
  }
}

$env:JAVA_HOME = $jdkHome
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$gradleExitCode = 1

& node (Join-Path $PSScriptRoot "patch-mediapipe.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node (Join-Path $PSScriptRoot "patch-android-networking.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location $androidDir
try {
  # Each included build needs its own task history; a shared project cache
  # makes the Expo plugins' Kotlin task outputs collide.
  & .\gradlew.bat app:assembleRelease -x lint -x test --no-watch-fs "-PreactNativeDevServerPort=8082" "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
  $gradleExitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

exit $gradleExitCode
