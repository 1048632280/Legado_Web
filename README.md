# Legado 本地 TXT 阅读器

项目提供两个彼此独立的数据运行模式，共用阅读界面和 TXT 章节解析逻辑：

- **网站版**：构建为静态网站，可部署到任意静态文件托管服务。书籍、章节、阅读进度和设置存放在当前浏览器的 IndexedDB 中，不会上传，也不会在浏览器之间同步。
- **Tauri 桌面版**：作为 Windows 桌面程序运行。书籍、章节、阅读进度和设置保存在安装目录下的 `data` 文件夹中；安装程序默认目录为 `D:\Legado Web`。

两种模式的数据相互独立。网站版通过文件选择或拖放导入 TXT；桌面版还支持拖入文件或文件夹。

## 网站版

本地开发：

```powershell
pnpm install
pnpm web:dev
```

生成可部署的静态网站文件：

```powershell
pnpm web:build
```

构建输出在 `dist/`。本地预览：

```powershell
pnpm web:preview
```

网站版没有应用服务器或远程数据 API；部署服务只负责提供静态页面文件。用户书籍留在使用者自己的浏览器存储中。

## Tauri 桌面版

开发运行：

```powershell
pnpm desktop:dev
```

一次构建全部四种 Windows 发行版本：

```powershell
pnpm desktop:build
```

也可以单独构建：

```powershell
pnpm desktop:build:online
pnpm desktop:build:offline
pnpm desktop:build:portable
pnpm desktop:build:portable-offline
```

发行文件位于 `src-tauri/target/release/packages/`：

- `online-installer/`：较小的安装器；缺少 WebView2 时安装阶段联网下载安装运行时。
- `offline-installer/`：安装包内带完整 WebView2 运行时，安装时不联网。默认安装目录为 `D:\Legado Web`，书籍数据保存在安装目录的 `data` 文件夹。
- `portable/`：单个应用 EXE，使用电脑已安装的 WebView2；数据保存在 EXE 同目录的 `data` 文件夹。
- `portable-offline/`：单个离线便携 EXE，内含固定版 WebView2。首次运行会在 EXE 旁边创建 `Legado Web Portable` 文件夹、解出阅读器和运行时并启动；后续再次双击单文件会直接启动已解出的阅读器；数据位于该文件夹下的 `data`。构建时会从 Microsoft 下载 WebView2 CAB，阅读器运行时不联网。

Tauri 使用单独的 `desktop` 前端构建模式。网站版和桌面版的数据互不共享。

## 功能

- 导入或拖放本地 TXT 文件。
- 按常见章节标题切分目录；未识别到标题时按内容长度分章。
- 保存书架、目录、阅读进度和阅读设置。
- 支持调速自动阅读，可用滑块或数值输入设置速度。
- 每本书可维护独立的正文过滤规则。
- 提供宋体、黑体、楷体、苹方、微软雅黑五种字体选项。
- 清空当前运行模式下的本地数据。
