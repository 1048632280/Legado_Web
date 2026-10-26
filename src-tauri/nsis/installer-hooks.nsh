!macro NSIS_HOOK_PREINSTALL
  ; 首次安装使用 D 盘默认目录，用户手动选择的目录保持不变。
  ${If} $INSTDIR == "$PROGRAMFILES64\${PRODUCTNAME}"
    StrCpy $INSTDIR "D:\Legado Web"
  ${EndIf}
  ; 默认模板先设置过一次输出目录，改完安装路径后必须重新设置。
  SetOutPath $INSTDIR
  CreateDirectory "$INSTDIR\data"
  ; 安装目录是全局目录，授予普通用户写入可见 data 目录的权限。
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR\data" /grant *S-1-5-32-545:(OI)(CI)M'
  Pop $0
!macroend
