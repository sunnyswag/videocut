# VideoCut

视频剪辑 CLI 工具，专为播客视频设计。

## 安装

```bash
npm install -g @videocut/cli
```

## 命令

### 转录视频

```bash
videocut transcribe <video> [-o <output-dir>]
```

使用火山引擎 API 转录视频，生成字幕文件。

### 生成字幕结构

```bash
videocut generate-subtitles <json> [-o <output-file>]
```

从转录结果生成可编辑的字幕结构。

### 应用编辑

```bash
videocut apply-edits <subtitles> <edits> [-o <output-file>]
```

将编辑操作应用到字幕文件。

### 启动审核服务器

```bash
videocut review-server [port] [-p <path>]
```

启动 Web 界面进行可视化审核和剪辑。

### 执行剪辑

```bash
videocut cut <video> <segments> [-o <output>] [--project <path>]
```

根据删除片段执行视频剪辑。

## 开发

### 构建

```bash
# 构建 CLI
cd videocut-cli && npm run build

# 构建 UI
cd videocut-ui && npm run build
```

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
cd videocut-ui && npm run dev

# 在另一个终端启动后端
cd videocut-cli && node bin/videocut.js review-server
```

## 项目结构

```
videocut/
├── videocut-cli/     # CLI 工具 (TypeScript)
│   ├── src/
│   │   ├── commands/ # CLI 命令
│   │   └── core/     # 核心逻辑
│   └── bin/          # 入口脚本
├── videocut-ui/      # Web UI (React + Vite)
│   └── src/
│       ├── components/
│       └── hooks/
└── .cursor/          # Cursor Skills 配置
```

## License

MIT
