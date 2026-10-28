# Legado Next

`next` 现在由两个明确的部分组成：

- `src/lib.rs`：Rust 本地核心，负责 SQLite、TXT 编码识别、章节切分、阅读进度和内容过滤，通过 JSON FFI 接口提供给界面。
- `flutter/`：Flutter Desktop 原生渲染界面，负责书架、阅读器、目录、设置、过滤和动画交互。不使用 Slint、HTML、CSS、Vue、Node 或 WebView。

## Windows 开发

安装 Flutter stable 和 Rust 后，在 `next/flutter` 执行：

```powershell
flutter create --platforms=windows .
flutter pub get
```

正式构建由 GitHub Actions 完成，不要求本地构建验收。
