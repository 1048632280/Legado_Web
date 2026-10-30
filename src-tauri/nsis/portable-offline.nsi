Unicode true
ManifestDPIAware true
RequestExecutionLevel user
SetCompressor /SOLID lzma
!include LogicLib.nsh

!ifndef APP_EXE
  !error "APP_EXE is required"
!endif
!ifndef WEBVIEW_CHUNKS
  !error "WEBVIEW_CHUNKS is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif

Name "Legado 本地 TXT 阅读器离线便携版"
OutFile "${OUTPUT_FILE}"
InstallDir "$EXEDIR\Legado Web Portable"
ShowInstDetails show
Page instfiles

!macro AddRuntimeChunk NAME
  File /oname=${NAME} "${WEBVIEW_CHUNKS}\${NAME}"
!macroend

Function .onInit
  IfFileExists "$INSTDIR\webview2\portable-runtime.ready" 0 init_done
  IfFileExists "$INSTDIR\legado-local-reader.exe" 0 init_done
  Exec '"$INSTDIR\legado-local-reader.exe"'
  Quit

init_done:
FunctionEnd

Section
  IfFileExists "$INSTDIR\webview2\portable-runtime.ready" 0 extract_runtime
  IfFileExists "$INSTDIR\legado-local-reader.exe" runtime_ready

extract_runtime:
  SetOutPath "$INSTDIR"
  File /oname=legado-local-reader.exe "${APP_EXE}"
  CreateDirectory "$INSTDIR\webview2"
  SetOutPath "$INSTDIR\webview2"
  !include "${WEBVIEW_CHUNKS}\chunks.nsh"
  SetOutPath "$INSTDIR"
  nsExec::ExecToLog '"$INSTDIR\legado-local-reader.exe" --merge-webview-cab "$INSTDIR\webview2"'
  Pop $0
  ${If} $0 != 0
    Abort "固定版 WebView2 分片合并失败。"
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\expand.exe" -F:* "$INSTDIR\webview2\webview2-fixed.cab" "$INSTDIR\webview2"'
  Pop $0
  Delete "$INSTDIR\webview2\webview2-fixed.cab"
  Delete "$INSTDIR\webview2\webview2-fixed.*.part"
  ${If} $0 != 0
    Abort "固定版 WebView2 解压失败。请确认有足够的磁盘空间后重试。"
  ${EndIf}
  IfFileExists "$INSTDIR\webview2\msedgewebview2.exe" runtime_extracted
  Abort "固定版 WebView2 文件不完整。请删除便携版目录后重试。"

runtime_extracted:
  FileOpen $0 "$INSTDIR\webview2\portable-runtime.ready" w
  FileWrite $0 "fixed-runtime"
  FileClose $0

runtime_ready:
  CreateDirectory "$INSTDIR\data"
  Exec '"$INSTDIR\legado-local-reader.exe"'
SectionEnd
