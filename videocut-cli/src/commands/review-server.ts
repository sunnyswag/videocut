import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { cutVideo, mergeProjectVideos, computeCutPlan } from '../core/video.js';
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

interface VideoProbe {
  codecName: string;
  width: number;
  height: number;
  avgFrameRate: number;
  bitRate: number;
}

const REVIEW_PROXY_FILENAME = 'review_proxy.mp4';

function resolveProjectRoot(candidate: string): Project | null {
  const commonDir = path.join(candidate, 'common');
  const edited = path.join(commonDir, 'subtitles_words_edited.json');
  const fallback = path.join(commonDir, 'subtitles_words.json');
  if (!fs.existsSync(edited) && !fs.existsSync(fallback)) {
    return null;
  }

  const projectDir = path.basename(candidate) === 'clipping' ? path.dirname(candidate) : candidate;
  const id = path.basename(projectDir);
  return {
    id,
    name: id,
    path: candidate,
    hasEdited: fs.existsSync(edited),
  };
}

function getProjects(rootPath: string): Project[] {
  const list: Project[] = [];

  const directProject = resolveProjectRoot(rootPath);
  if (directProject) {
    list.push(directProject);
    return list;
  }

  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return list;
  }

  const dirs = fs.readdirSync(rootPath);
  for (const d of dirs) {
    const projectDir = path.join(rootPath, d);
    const project = resolveProjectRoot(path.join(projectDir, 'clipping')) || resolveProjectRoot(projectDir);
    if (project) {
      list.push(project);
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

  // 1. output parent directory (symlink location)
  const inParent = findMp4InDir(parentDir);
  if (inParent) return inParent;

  // 2. project directory itself
  const inProject = findMp4InDir(project.path);
  if (inProject) return inProject;

  // 3. walk up and look for a videos/ folder (up to 3 levels)
  let ancestor = parentDir;
  for (let i = 0; i < 3; i++) {
    const videosDir = path.join(ancestor, 'videos');
    const inVideos = findMp4InDir(videosDir);
    if (inVideos) return inVideos;
    const next = path.dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }

  // 4. macro_notes directory (legacy layout compatibility)
  const macroDir = path.resolve(rootPath, '..', '..', '..', 'macro_notes');
  if (fs.existsSync(macroDir)) {
    const videoName = project.id.replace(/^\d{4}-\d{2}-\d{2}_/, '');
    const candidate = path.join(macroDir, videoName + '.mp4');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseFrameRate(value: string | undefined): number {
  if (!value) return 0;
  const [numStr, denStr] = value.split('/');
  const numerator = Number(numStr);
  const denominator = Number(denStr);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
    return numerator / denominator;
  }
  const fallback = Number(value);
  return Number.isFinite(fallback) ? fallback : 0;
}

function probeVideo(inputPath: string): VideoProbe | null {
  try {
    const raw = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,bit_rate -of json "file:${inputPath}"`,
      { stdio: 'pipe' }
    ).toString();
    const data = JSON.parse(raw);
    const stream = Array.isArray(data?.streams) ? data.streams[0] : null;
    if (!stream) return null;
    return {
      codecName: String(stream.codec_name || '').toLowerCase(),
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
      avgFrameRate: parseFrameRate(stream.avg_frame_rate),
      bitRate: Number(stream.bit_rate || 0),
    };
  } catch {
    return null;
  }
}

function shouldUseReviewProxy(inputPath: string): boolean {
  const probe = probeVideo(inputPath);
  if (!probe) return false;
  const heavyResolution = probe.width >= 3000 || probe.height >= 1700;
  const highBitrate = probe.bitRate >= 12_000_000;
  const highFrameRate = probe.avgFrameRate > 30;
  return probe.codecName === 'hevc' || probe.codecName === 'av1' || (heavyResolution && highBitrate && highFrameRate);
}

function getReviewProxyPath(project: Project): string {
  return path.join(project.path, '3_review', REVIEW_PROXY_FILENAME);
}

function hasFreshReviewProxy(inputPath: string, proxyPath: string): boolean {
  if (!fs.existsSync(proxyPath)) return false;
  const proxyStat = fs.statSync(proxyPath);
  if (proxyStat.size <= 0) return false;
  const inputStat = fs.statSync(inputPath);
  return proxyStat.mtimeMs >= inputStat.mtimeMs;
}

function createReviewProxy(inputPath: string, outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = outputPath.replace(/\.mp4$/i, `.tmp-${process.pid}.mp4`);
  const filter = "scale='min(1920,iw)':-2:flags=lanczos,fps=30";
  const cmd = `ffmpeg -y -i "file:${inputPath}" -vf "${filter}" -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k "file:${tempPath}"`;

  try {
    execSync(cmd, { stdio: 'pipe', maxBuffer: 1024 * 1024 * 16 });
    fs.renameSync(tempPath, outputPath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function resolveReviewVideoPath(project: Project, rootPath: string): string | null {
  const inputPath = findVideoFile(project, rootPath);
  if (!inputPath) return null;
  if (!shouldUseReviewProxy(inputPath)) return inputPath;

  const proxyPath = getReviewProxyPath(project);
  if (hasFreshReviewProxy(inputPath, proxyPath)) {
    return proxyPath;
  }

  try {
    console.log(`🎞️ Creating review proxy: ${project.id}`);
    createReviewProxy(inputPath, proxyPath);
    return proxyPath;
  } catch (err: any) {
    console.warn(`⚠️ Failed to create review proxy, falling back to source video: ${err.message}`);
    return inputPath;
  }
}

function flattenWords(opted: Utterance[]): FlattenedWord[] {
  const out: FlattenedWord[] = [];
  opted.forEach((node, parentIndex) => {
    const parentOpt = node.opt || 'keep';
    if (Array.isArray(node.words) && node.words.length > 0) {
      const coveredKeepRanges = node.words
        .filter((word) => (parentOpt === 'del' ? 'del' : word.opt || 'keep') !== 'del')
        .map((word) => ({
          start: typeof word.start_time === 'number' ? word.start_time / 1000 : (node.start_time || 0) / 1000,
          end: typeof word.end_time === 'number' ? word.end_time / 1000 : (node.end_time || 0) / 1000,
        }));

      node.words.forEach((w, childIndex) => {
        const start = typeof w.start_time === 'number' ? w.start_time / 1000 : (node.start_time || 0) / 1000;
        const end = typeof w.end_time === 'number' ? w.end_time / 1000 : (node.end_time || 0) / 1000;
        const opt = parentOpt === 'del' ? 'del' : w.opt || 'keep';
        const isCoveredByKeptEditedWord =
          opt === 'del' &&
          coveredKeepRanges.some((range) => start >= range.start && end <= range.end && (end - start) > 0);

        if (isCoveredByKeptEditedWord) {
          return;
        }

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

function writeProjectEdits(project: Project, deletes: DeleteSegment[], deleteSegments: DeleteSegment[]) {
  const editsPath = path.join(project.path, 'edits.json');
  const deletePath = path.join(project.path, 'delete_segments.json');
  fs.writeFileSync(editsPath, JSON.stringify({ deletes }, null, 2));
  fs.writeFileSync(deletePath, JSON.stringify(deleteSegments, null, 2));
  return { editsPath, deletePath };
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
      const videoPath = resolveReviewVideoPath(project, rootPath);
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
          'Cache-Control': 'public, max-age=3600',
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
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
            res.end(JSON.stringify({ success: false, error: 'No delete segments selected. Please choose content to remove first.' }));
            return;
          }

          const { editsPath, deletePath } = writeProjectEdits(project, normalized.deletes, deleteSegments);
          console.log(`📝 Saved edits: ${editsPath}`);
          console.log(`📝 Saved ${deleteSegments.length} delete segments: ${deletePath}`);

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
            subtitleOutput = path.join(outputDir, `${baseName}_cut_subtitled.mp4`);
            burnSubtitles(outputFile, srtPath, subtitleOutput);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              output: outputFile,
              subtitleOutput,
              originalDuration: originalDuration.toFixed(2),
              newDuration: newDuration.toFixed(2),
              deletedDuration: deletedDuration.toFixed(2),
              savedPercent,
            })
          );
        } catch (err: any) {
          console.error('❌ Cut failed:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/merge-cut') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const projectIds = Array.isArray(payload?.projectIds) ? payload.projectIds.map((id: unknown) => String(id)) : [];
          const deleteMap = payload?.deleteMap && typeof payload.deleteMap === 'object' ? payload.deleteMap : {};
          const burnSubtitle = Boolean(payload?.burnSubtitle);

          if (projectIds.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Please select at least one project for merged export.' }));
            return;
          }

          const mergeProjects = projectIds.map((projectId: string) => {
            const project = getProjectById(rootPath, projectId);
            if (!project) {
              throw new Error(`Project not found: ${projectId}`);
            }
            const inputPath = findVideoFile(project, rootPath);
            if (!inputPath) {
              throw new Error(`No .mp4 found for project: ${projectId}`);
            }

            const { opted } = loadProjectWordsRaw(project);
            const rawDeletes = Array.isArray(deleteMap[projectId]) ? deleteMap[projectId] : [];
            const normalizedDeletes = rawDeletes.map((seg: any) => ({
              start: Number(seg?.start || 0),
              end: Number(seg?.end || 0),
            }));
            const deleteSegments = buildDeleteSegmentsFromDeletes(opted, normalizedDeletes as any);
            const plan = computeCutPlan(inputPath, deleteSegments, project.path);
            const { editsPath, deletePath } = writeProjectEdits(project, normalizedDeletes, deleteSegments);
            console.log(`📝 Saved edits: ${editsPath}`);
            console.log(`📝 Saved ${deleteSegments.length} delete segments: ${deletePath}`);

            return {
              projectId,
              project,
              opted,
              plan,
              inputPath,
              deleteList: deleteSegments,
              projectPath: project.path,
            };
          });

          const outputFile = path.join(rootPath, 'merged_cut.mp4');
          const mergeResult = mergeProjectVideos(mergeProjects, outputFile);
          const deletedDuration = Math.max(0, mergeResult.originalDuration - mergeResult.newDuration);
          const savedPercent = mergeResult.originalDuration > 0
            ? ((deletedDuration / mergeResult.originalDuration) * 100).toFixed(1)
            : '0.0';
          let subtitleOutput: string | null = null;
          let srtPath: string | null = null;

          if (burnSubtitle) {
            let offset = 0;
            const mergedSubtitles = mergeProjects.flatMap((item: { opted: Utterance[]; plan: { audioOffset: number; keepSegments: DeleteSegment[] } }) => {
              const subtitles = buildSubtitlesFromEditedOpted(item.opted, item.plan.audioOffset, item.plan.keepSegments)
                .map((subtitle) => ({
                  ...subtitle,
                  start: subtitle.start + offset,
                  end: subtitle.end + offset,
                }));
              const keptDuration = item.plan.keepSegments.reduce((sum: number, seg: DeleteSegment) => sum + (seg.end - seg.start), 0);
              offset += keptDuration;
              return subtitles;
            });

            srtPath = path.join(rootPath, 'merged_cut.srt');
            fs.writeFileSync(srtPath, generateSrt(mergedSubtitles));
            subtitleOutput = path.join(rootPath, 'merged_cut_subtitled.mp4');
            burnSubtitles(outputFile, srtPath, subtitleOutput);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              output: outputFile,
              subtitleOutput,
              originalDuration: mergeResult.originalDuration.toFixed(2),
              newDuration: mergeResult.newDuration.toFixed(2),
              deletedDuration: deletedDuration.toFixed(2),
              savedPercent,
              projectCount: mergeResult.projectCount,
            })
          );
        } catch (err: any) {
          console.error('❌ Merge export failed:', err.message);
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
🎬 Review server started
📍 URL: http://localhost:${port}
📂 Root path: ${rootPath}
📋 Project count: ${projects.length}

Instructions:
1. Open the web page and choose a project tab
2. Review the segments to remove, then click "Execute Cut"
    `);
  });
}
