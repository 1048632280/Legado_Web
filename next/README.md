# Legado Next

`next` 是 Legado Web 本地 TXT 阅读器的全新原生重写版本。它只使用 Rust、Slint 和 SQLite，不依赖浏览器、WebView、HTML/CSS、Vue 或 Node，也不提供网络、书源、在线搜索和同步功能。

## 功能

- TXT 文件选择导入、章节自动识别和无标题文本自动分章
- 本地书架、书籍筛选、单本删除和全部数据清空
- 目录跳转、上一章/下一章、阅读进度保存与恢复
- 阅读主题、字体大小、行距、段距和正文宽度设置
- 每本书独立的内容替换/删除规则
- SQLite 本地持久化，应用数据使用平台标准用户数据目录

## 构建

本地不要求作为验收环境。GitHub Actions 会执行 `cargo fmt --check`、`cargo test`、`cargo clippy`，并暂时只构建 Windows x64 发布包。
