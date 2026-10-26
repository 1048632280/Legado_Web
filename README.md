# 本地 TXT 阅读器

这是一个纯浏览器本地运行的 TXT 阅读器。不包含书源、订阅、在线搜索、远程内容抓取、数据库服务或任何联网接口。

书籍和章节保存到浏览器 IndexedDB，阅读配置和最近阅读记录保存到 localStorage。导入的内容不会上传到服务器。

## 直接使用（Windows）

最终用户不需要安装 Node.js、pnpm 或启动开发服务器。执行一次桌面构建：

```bash
pnpm install
pnpm desktop:build
```

安装包位于 `src-tauri/target/release/bundle/nsis/Legado 本地 TXT 阅读器_1.0.0_x64-setup.exe`。默认安装到 `D:\Legado Web`，并自动创建桌面快捷方式和开始菜单快捷方式。双击安装后即可使用，书籍和阅读数据保存在本机。

## 开发调试

```bash
pnpm install
pnpm dev
```

开发调试时执行 `pnpm dev -- --open`，浏览器会打开 `http://127.0.0.1:8080/`。

## 能力

- 导入或拖拽本地 TXT 文件。
- 按常见章节标题切分目录；未识别到标题时按内容长度分章。
- 保存书架、目录、阅读进度和阅读设置。
- 提供宋体、黑体、楷体、苹方、微软雅黑五种内置字体选项。
- 支持清空本地数据。

## 构建

```bash
pnpm build
pnpm preview
```

构建产物位于 `dist/`。预览服务仅监听本机 `127.0.0.1`。

## 数据说明

书籍、章节、阅读进度和设置均保存在安装目录的 `data` 文件夹中。

## 兼容性

| Edge | Firefox | Chrome | Safari |
| ---- | ------- | ------ | ------ |
| >= 85 | >= 79 | >= 85 | >= 14.1 |
