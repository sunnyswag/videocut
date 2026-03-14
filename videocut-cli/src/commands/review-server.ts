import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cutVideo } from '../core/video.js';
import { applyEditsToOpted, deepClone, buildDeleteSegmentsFromDeletes } from '../core/edits.js';
import { generateSrt, buildSubtitlesFromEditedOpted, burnSubtitles } from '../core/subtitle.js';
import type { Project, Utterance, DeleteSegment, Edits } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

interface FlattenedWord {
  start: number;
  end: number;
  text: string;
  opt: string;
  parentIndex: number;
  childIndex?: number;
}

function getProjects(rootPath: string): Project[] {
  const list: Project[] = [];
  const common = path.join(rootPath, 'common');
  const wordsFile = path.join(common, 'subtitles_words_edited.json');
  const wordsFallback = path.join(common, 'subtitles_words.json');

  if (fs.existsSync(wordsFile) || fs.existsSync(wordsFallback)) {
    const id = path.basename(path.dirname(rootPath));
    list.push({
      id,
      name: id,
      path: rootPath,
      hasEdited: fs.existsSync(wordsFile),
    });
    return list;
  }

  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return list;
  }

  const dirs = fs.readdirSync(rootPath);
  for (const d of dirs) {
    const projectRoot = path.join(rootPath, d, 'clipping');
    const commonDir = path.join(projectRoot, 'common');
    const edited = path.join(commonDir, 'subtitles_words_edited.json');
    const fallback = path.join(commonDir, 'subtitles_words.json');
    if (fs.existsSync(edited) || fs.existsSync(fallback)) {
      list.push({
        id: d,
        name: d,
        path: projectRoot,
        hasEdited: fs.existsSync(edited),
      });
    }
  }
  return list;
}

function getProjectById(rootPath: string, projectId: string): Project | null {
  return getProjects(rootPath).find((p) => p.id === projectId) || null;
}

function findMp4InDir(dir: string): string | null {
  try {
    const mp4s = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4') && !f.endsWith('_cut.mp4'));
    if (mp4s.length > 0) return path.join(dir, mp4s[0]);
  } catch {}
  return null;
}

function findVideoFile(project: Project, rootPath: string): string | null {
  const parentDir = path.dirname(project.path);

  // 1. output 父目录（symlink 所在位置）
  const inParent = findMp4InDir(parentDir);
  if (inParent) return inParent;

  // 2. 项目目录自身
  const inProject = findMp4InDir(project.path);
  if (inProject) return inProject;

  // 3. 向上逐级查找 videos/ 文件夹（最多 3 层）
  let ancestor = parentDir;
  for (let i = 0; i < 3; i++) {
    const videosDir = path.join(ancestor, 'videos');
    const inVideos = findMp4InDir(videosDir);
    if (inVideos) return inVideos;
    const next = path.dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }

  // 4. macro_notes 目录（兼容旧目录结构）
  const macroDir = path.resolve(rootPath, '..', '..', '..', 'macro_notes');
  if (fs.existsSync(macroDir)) {
    const videoName = project.id.replace(/^\d{4}-\d{2}-\d{2}_/, '');
    const candidate = path.join(macroDir, videoName + '.mp4');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function flattenWords(opted: Utterance[]): FlattenedWord[] {
  const out: FlattenedWord[] = [];
  opted.forEach((node, parentIndex) => {
    const parentOpt = node.opt || 'keep';
    if (Array.isArray(node.words) && node.words.length > 0) {
      node.words.forEach((w, childIndex) => {
        const start = typeof w.start_time === 'number' ? w.start_time / 1000 : (node.start_time || 0) / 1000;
        const end = typeof w.end_time === 'number' ? w.end_time / 1000 : (node.end_time || 0) / 1000;
        const opt = parentOpt === 'del' ? 'del' : w.opt || 'keep';
        out.push({ start, end, text: (w.text || '').trim(), opt, parentIndex, childIndex });
      });
    } else {
      const start = (node.start_time || 0) / 1000;
      const end = (node.end_time || 0) / 1000;
      out.push({ start, end, text: (node.text || '').trim(), opt: parentOpt, parentIndex, childIndex: undefined });
    }
  });
  return out;
}

function loadProjectWordsRaw(project: Project): { rawPath: string; opted: Utterance[] } {
  const commonDir = path.join(project.path, 'common');
  const editedPath = path.join(commonDir, 'subtitles_words_edited.json');
  const wordsPath = path.join(commonDir, 'subtitles_words.json');
  const rawPath = fs.existsSync(editedPath) ? editedPath : wordsPath;
  return {
    rawPath,
    opted: JSON.parse(fs.readFileSync(rawPath, 'utf8')),
  };
}

interface NormalizedPayload {
  deletes: DeleteSegment[];
  burnSubtitle: boolean;
}

function normalizeEditsPayload(payload: any): NormalizedPayload {
  if (Array.isArray(payload)) {
    return { deletes: payload.map((seg) => ({ start: seg.start, end: seg.end })), burnSubtitle: false };
  }
  const deletes = Array.isArray(payload?.deletes) ? payload.deletes : [];
  const burnSubtitle = Boolean(payload?.burnSubtitle);
  return { deletes, burnSubtitle };
}

export function reviewServer(port: number = 8899, options: { path?: string }): void {
  const rootPath = path.resolve(options.path || path.join(process.cwd(), 'output'));
  const staticDir = path.join(__dirname, '..', '..', 'static');

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const urlPath = req.url?.split('?')[0] || '/';

    if (req.method === 'GET' && urlPath === '/api/projects') {
      try {
        const projects = getProjects(rootPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(projects));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    const dataMatch = urlPath.match(/^\/api\/data\/(.+)$/);
    if (req.method === 'GET' && dataMatch) {
      const projectId = decodeURIComponent(dataMatch[1]);
      const project = getProjectById(rootPath, projectId);
      if (!project) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Project not found' }));
        return;
      }
      try {
        const { opted } = loadProjectWordsRaw(project);
        const words = flattenWords(opted);
        const autoSelected: number[] = [];
        words.forEach((w, i) => {
          if (w.opt === 'del') autoSelected.push(i);
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ words, autoSelected }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    const videoMatch = urlPath.match(/^\/api\/video\/(.+)$/);
    if (req.method === 'GET' && videoMatch) {
      const projectId = decodeURIComponent(videoMatch[1]);
      const project = getProjectById(rootPath, projectId);
      if (!project) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const videoPath = findVideoFile(project, rootPath);
      if (!videoPath) {
        res.writeHead(404);
        res.end('Video not found');
        return;
      }
      const stat = fs.statSync(videoPath);
      if (req.headers.range) {
        const range = req.headers.range.replace('bytes=', '').split('-');
        const start = parseInt(range[0], 10);
        const end = range[1] ? parseInt(range[1], 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(videoPath).pipe(res);
      }
      return;
    }

    const cutMatch = urlPath.match(/^\/api\/cut\/(.+)$/);
    if (req.method === 'POST' && cutMatch) {
      const projectId = decodeURIComponent(cutMatch[1]);
      const project = getProjectById(rootPath, projectId);
      if (!project) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Project not found' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const requestPayload = JSON.parse(body);
          const inputPath = findVideoFile(project, rootPath);
          if (!inputPath) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'No .mp4 found for project' }));
            return;
          }
          const baseName = path.basename(inputPath, '.mp4');
          const outputDir = path.dirname(project.path);
          const outputFile = path.join(outputDir, `${baseName}_cut.mp4`);
          const { opted } = loadProjectWordsRaw(project);
          const normalized = normalizeEditsPayload(requestPayload);
          const deleteSegments = buildDeleteSegmentsFromDeletes(opted, normalized.deletes as any);

          if (deleteSegments.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: '删除片段为空，请先选择要删除的内容' }));
            return;
          }

          const editsPath = path.join(project.path, 'edits.json');
          const deletePath = path.join(project.path, 'delete_segments.json');
          fs.writeFileSync(editsPath, JSON.stringify({ deletes: normalized.deletes }, null, 2));
          fs.writeFileSync(deletePath, JSON.stringify(deleteSegments, null, 2));
          console.log(`📝 保存编辑: ${editsPath}`);
          console.log(`📝 保存 ${deleteSegments.length} 个删除片段: ${deletePath}`);

          const cutResult = cutVideo(inputPath, deleteSegments, outputFile, project.path);
          const originalDuration = cutResult.originalDuration;
          const newDuration = cutResult.newDuration;
          const deletedDuration = originalDuration - newDuration;
          const savedPercent = ((deletedDuration / originalDuration) * 100).toFixed(1);

          let subtitleOutput: string | null = null;
          let srtPath: string | null = null;
          if (normalized.burnSubtitle) {
            const subtitles = buildSubtitlesFromEditedOpted(opted, cutResult.audioOffset, cutResult.keepSegments);
            srtPath = path.join(outputDir, `${baseName}_cut.srt`);
            fs.writeFileSync(srtPath, generateSrt(subtitles));
            subtitleOutput = path.join(outputDir, `${baseName}_cut_字幕.mp4`);
            burnSubtitles(outputFile, srtPath, subtitleOutput);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              output: outputFile,
              subtitleOutput,
              srtPath,
              editsPath,
              deletePath,
              originalDuration: originalDuration.toFixed(2),
              newDuration: newDuration.toFixed(2),
              deletedDuration: deletedDuration.toFixed(2),
              savedPercent,
              message: normalized.burnSubtitle
                ? `剪辑+烧录完成: ${subtitleOutput || outputFile}`
                : `剪辑完成: ${outputFile}`,
            })
          );
        } catch (err: any) {
          console.error('❌ 剪辑失败:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && (urlPath === '/' || urlPath === '/index.html')) {
      const indexPath = path.join(staticDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        res.writeHead(404);
        res.end('Static files not built. Run: npm run build:ui');
        return;
      }
      const stat = fs.statSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': stat.size });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }

    const assetMatch = urlPath.match(/^\/assets\/(.+)$/);
    if (req.method === 'GET' && assetMatch) {
      const assetPath = path.join(staticDir, 'assets', assetMatch[1]);
      if (!fs.existsSync(assetPath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(assetPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const stat = fs.statSync(assetPath);
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size });
      fs.createReadStream(assetPath).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    const projects = getProjects(rootPath);
    console.log(`
🎬 审核服务器已启动
📍 地址: http://localhost:${port}
📂 根路径: ${rootPath}
📋 项目数: ${projects.length}

操作说明:
1. 打开网页，选择项目 Tab
2. 审核选择要删除的片段，点击「🎬 执行剪辑」
    `);
  });
}
