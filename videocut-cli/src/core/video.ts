import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { DeleteSegment, CutResult } from './types.js';

const BUFFER_MS = 50;
const CROSSFADE_MS = 30;

interface Encoder {
  name: string;
  args: string;
  label: string;
}

function canUseEncoder(enc: Encoder): boolean {
  const testCmd = enc.name === 'h264_vaapi'
    ? `ffmpeg -y -f lavfi -i testsrc=size=128x128:rate=1 -t 1 -vf "format=nv12,hwupload" -vaapi_device /dev/dri/renderD128 -c:v ${enc.name} ${enc.args} -f null -`
    : `ffmpeg -y -f lavfi -i testsrc=size=128x128:rate=1 -t 1 -c:v ${enc.name} ${enc.args} -f null -`;

  try {
    execSync(testCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function detectEncoder(): Encoder {
  const platform = process.platform;
  const encoders: Encoder[] = [];

  if (platform === 'darwin') {
    encoders.push({ name: 'h264_videotoolbox', args: '-q:v 60', label: 'VideoToolbox (macOS)' });
  } else if (platform === 'win32') {
    encoders.push({ name: 'h264_nvenc', args: '-gpu 0 -preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_qsv', args: '-global_quality 20', label: 'QSV (Intel)' });
    encoders.push({ name: 'h264_amf', args: '-quality balanced', label: 'AMF (AMD)' });
  } else {
    encoders.push({ name: 'h264_nvenc', args: '-gpu 0 -preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_vaapi', args: '-qp 20', label: 'VAAPI (Linux)' });
  }

  encoders.push({ name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (软件)' });

  let encoderList = '';
  try {
    encoderList = execSync('ffmpeg -hide_banner -encoders', { stdio: 'pipe' }).toString();
  } catch {
    encoderList = '';
  }

  for (const enc of encoders) {
    try {
      if (!encoderList.includes(enc.name)) continue;
      if (!canUseEncoder(enc)) {
        console.log(`⚠️ 编码器存在但不可用，跳过: ${enc.label}`);
        continue;
      }
      console.log(`🎯 检测到编码器: ${enc.label}`);
      return enc;
    } catch {
      // continue
    }
  }

  return { name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (软件)' };
}

let cachedEncoder: Encoder | null = null;

function getEncoder(): Encoder {
  if (!cachedEncoder) cachedEncoder = detectEncoder();
  return cachedEncoder;
}

export function getPreferredEncoder(): { name: string; args: string; label: string } {
  return getEncoder();
}

function getAudioOffset(projectPath: string | undefined): number {
  if (!projectPath) return 0;
  const audioPath = path.join(projectPath, '1_transcribe', 'audio.mp3');
  if (!fs.existsSync(audioPath)) return 0;

  try {
    const offsetCmd = `ffprobe -v error -show_entries format=start_time -of csv=p=0 "${audioPath}"`;
    const audioOffset = parseFloat(execSync(offsetCmd).toString().trim()) || 0;
    if (audioOffset > 0) {
      console.log(`🔧 检测到音频偏移: ${audioOffset.toFixed(3)}s，自动补偿`);
    }
    return audioOffset;
  } catch {
    return 0;
  }
}

function getVideoDuration(inputPath: string): number {
  const probeCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${inputPath}"`;
  return parseFloat(execSync(probeCmd).toString().trim());
}

function mergeDeleteSegments(segments: DeleteSegment[]): DeleteSegment[] {
  const merged: DeleteSegment[] = [];
  for (const seg of segments) {
    if (!Number.isFinite(seg.start) || !Number.isFinite(seg.end) || seg.end <= seg.start) continue;
    if (merged.length === 0 || seg.start > merged[merged.length - 1].end) {
      merged.push({ ...seg });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
    }
  }
  return merged;
}

interface CutPlan {
  duration: number;
  audioOffset: number;
  bufferSec: number;
  crossfadeSec: number;
  mergedDelete: DeleteSegment[];
  keepSegments: DeleteSegment[];
}

interface MergeProjectInput {
  projectId: string;
  inputPath: string;
  deleteList: DeleteSegment[];
  projectPath?: string;
}

interface MergeCutResult {
  outputPath: string;
  originalDuration: number;
  newDuration: number;
  projectCount: number;
  segmentCount: number;
}

export function computeCutPlan(
  inputPath: string,
  deleteList: DeleteSegment[],
  projectPath?: string
): CutPlan {
  const duration = getVideoDuration(inputPath);
  const audioOffset = getAudioOffset(projectPath);
  const bufferSec = BUFFER_MS / 1000;

  const expandedDelete = (Array.isArray(deleteList) ? deleteList : [])
    .map((seg) => ({
      start: Math.max(0, Number(seg.start || 0) - audioOffset - bufferSec),
      end: Math.min(duration, Number(seg.end || 0) - audioOffset + bufferSec),
    }))
    .sort((a, b) => a.start - b.start);

  const mergedDelete = mergeDeleteSegments(expandedDelete);
  const keepSegments: DeleteSegment[] = [];
  let cursor = 0;
  for (const del of mergedDelete) {
    if (del.start > cursor) keepSegments.push({ start: cursor, end: del.start });
    cursor = del.end;
  }
  if (cursor < duration) keepSegments.push({ start: cursor, end: duration });

  return {
    duration,
    audioOffset,
    bufferSec,
    crossfadeSec: CROSSFADE_MS / 1000,
    mergedDelete,
    keepSegments,
  };
}

function buildFilterComplex(keepSegments: DeleteSegment[], crossfadeSec: number): string {
  const filters: string[] = [];
  let vconcat = '';

  for (let i = 0; i < keepSegments.length; i += 1) {
    const seg = keepSegments[i];
    filters.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    filters.push(`[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    vconcat += `[v${i}]`;
  }

  filters.push(`${vconcat}concat=n=${keepSegments.length}:v=1:a=0[outv]`);

  if (keepSegments.length === 1) {
    filters.push('[a0]anull[outa]');
  } else {
    let currentLabel = 'a0';
    for (let i = 1; i < keepSegments.length; i += 1) {
      const nextLabel = `a${i}`;
      const outLabel = i === keepSegments.length - 1 ? 'outa' : `amid${i}`;
      filters.push(`[${currentLabel}][${nextLabel}]acrossfade=d=${crossfadeSec.toFixed(3)}:c1=tri:c2=tri[${outLabel}]`);
      currentLabel = outLabel;
    }
  }

  return filters.join(';');
}

function concatRenderedFiles(partFiles: string[], outputPath: string, tmpDir: string): void {
  if (partFiles.length === 0) {
    throw new Error('没有可合并的片段');
  }

  if (partFiles.length === 1) {
    fs.copyFileSync(partFiles[0], outputPath);
    console.log(`✅ 输出: ${outputPath}`);
    return;
  }

  const listFile = path.join(tmpDir, 'list.txt');
  const listContent = partFiles.map((f) => `file '${path.resolve(f)}'`).join('\n');
  fs.writeFileSync(listFile, listContent);

  const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`;
  console.log('合并片段...');
  execSync(concatCmd, { stdio: 'pipe' });
  console.log(`✅ 输出: ${outputPath}`);
}

function executeFFmpegCutFallback(
  inputPath: string,
  keepSegments: DeleteSegment[],
  outputPath: string
): void {
  const tmpDir = `tmp_cut_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const partFiles: string[] = [];
    keepSegments.forEach((seg, i) => {
      const partFile = path.join(tmpDir, `part${i.toString().padStart(4, '0')}.mp4`);
      const segDuration = seg.end - seg.start;
      const encoder = getEncoder();
      const cmd = `ffmpeg -y -ss ${seg.start.toFixed(3)} -i "file:${inputPath}" -t ${segDuration.toFixed(3)} -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 128k -avoid_negative_ts make_zero "${partFile}"`;
      console.log(`切割片段 ${i + 1}/${keepSegments.length}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s`);
      execSync(cmd, { stdio: 'pipe' });
      partFiles.push(partFile);
    });

    concatRenderedFiles(partFiles, outputPath, tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function renderKeepSegments(
  inputPath: string,
  keepSegments: DeleteSegment[],
  outputPath: string,
  crossfadeSec: number = CROSSFADE_MS / 1000
): void {
  if (!Array.isArray(keepSegments) || keepSegments.length === 0) {
    throw new Error('keepSegments 不能为空');
  }

  const filterComplex = buildFilterComplex(keepSegments, crossfadeSec);
  const encoder = getEncoder();
  console.log(`✂️ 执行 FFmpeg 精确剪辑（${encoder.label}）...`);

  const cmd = `ffmpeg -y -i "file:${inputPath}" -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 192k "file:${outputPath}"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`✅ 输出: ${outputPath}`);
  } catch {
    console.error('FFmpeg 执行失败，尝试分段方案...');
    executeFFmpegCutFallback(inputPath, keepSegments, outputPath);
  }
}

export function cutVideo(
  inputPath: string,
  deleteList: DeleteSegment[],
  outputPath: string,
  projectPath?: string
): CutResult {
  if (!Array.isArray(deleteList) || deleteList.length === 0) {
    throw new Error('deleteList 不能为空');
  }

  const plan = computeCutPlan(inputPath, deleteList, projectPath);
  if (plan.keepSegments.length === 0) {
    throw new Error('删除范围覆盖整个视频，无法输出空视频');
  }

  console.log(`⚙️ 优化参数: 扩展范围=${BUFFER_MS}ms, 音频crossfade=${CROSSFADE_MS}ms`);
  console.log(`保留 ${plan.keepSegments.length} 个片段，删除 ${plan.mergedDelete.length} 个片段`);
  renderKeepSegments(inputPath, plan.keepSegments, outputPath, plan.crossfadeSec);

  const newDuration = getVideoDuration(outputPath);
  console.log(`📹 新时长: ${newDuration.toFixed(2)}s`);

  return {
    outputPath,
    keepSegments: plan.keepSegments,
    mergedDelete: plan.mergedDelete,
    audioOffset: plan.audioOffset,
    originalDuration: plan.duration,
    newDuration,
  };
}

export function mergeProjectVideos(projects: MergeProjectInput[], outputPath: string): MergeCutResult {
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error('projects 不能为空');
  }

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  const tmpDir = path.join(outputDir, `.tmp_merge_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let totalOriginalDuration = 0;
  const renderedFiles: string[] = [];

  try {
    projects.forEach((project, index) => {
      const plan = computeCutPlan(project.inputPath, project.deleteList, project.projectPath);
      totalOriginalDuration += plan.duration;
      if (plan.keepSegments.length === 0) {
        console.log(`⏭️ 跳过空项目: ${project.projectId}`);
        return;
      }

      const renderedPath = path.join(tmpDir, `project_${index.toString().padStart(2, '0')}.mp4`);
      console.log(`\n📦 渲染项目 ${index + 1}/${projects.length}: ${project.projectId}`);
      console.log(`保留 ${plan.keepSegments.length} 个片段，删除 ${plan.mergedDelete.length} 个片段`);
      renderKeepSegments(project.inputPath, plan.keepSegments, renderedPath, plan.crossfadeSec);
      renderedFiles.push(renderedPath);
    });

    concatRenderedFiles(renderedFiles, outputPath, tmpDir);
    const newDuration = getVideoDuration(outputPath);
    return {
      outputPath,
      originalDuration: totalOriginalDuration,
      newDuration,
      projectCount: projects.length,
      segmentCount: renderedFiles.length,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
