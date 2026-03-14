import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { assAlignmentFromPreset, assColorFromHex, escapeAssText, normalizeSubtitleStylePreset } from './subtitle-style.js';
import type { Utterance, DeleteSegment, Subtitle, SubtitleStylePreset } from './types.js';
import { getPreferredEncoder } from './video.js';

interface SubtitleFont {
  family: string;
  file?: string;
  fontsDir?: string;
}

function isWsl(): boolean {
  if (process.platform !== 'linux') return false;
  return fs.existsSync('/mnt/c/Windows/Fonts');
}

function escapeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function resolveSubtitleFont(): SubtitleFont {
  const envFontFile = process.env.VIDEOCUT_SUBTITLE_FONT_FILE;
  if (envFontFile && fs.existsSync(envFontFile)) {
    return {
      family: process.env.VIDEOCUT_SUBTITLE_FONT_NAME || path.basename(envFontFile, path.extname(envFontFile)),
      file: envFontFile,
      fontsDir: path.dirname(envFontFile),
    };
  }

  let candidates: SubtitleFont[];
  if (process.platform === 'darwin') {
    candidates = [
      { family: 'PingFang SC' },
      { family: 'Hiragino Sans GB' },
      { family: 'STHeiti' },
      { family: 'Arial Unicode MS' },
    ];
  } else if (isWsl()) {
    candidates = [
      { family: 'Noto Sans SC', file: '/mnt/c/Windows/Fonts/NotoSansSC-VF.ttf', fontsDir: '/mnt/c/Windows/Fonts' },
      { family: 'Microsoft YaHei', file: '/mnt/c/Windows/Fonts/msyh.ttc', fontsDir: '/mnt/c/Windows/Fonts' },
      { family: 'Microsoft YaHei', file: '/mnt/c/Windows/Fonts/msyhbd.ttc', fontsDir: '/mnt/c/Windows/Fonts' },
      { family: 'SimHei', file: '/mnt/c/Windows/Fonts/simhei.ttf', fontsDir: '/mnt/c/Windows/Fonts' },
      { family: 'SimSun', file: '/mnt/c/Windows/Fonts/simsun.ttc', fontsDir: '/mnt/c/Windows/Fonts' },
      { family: 'PingFang SC' },
    ];
  } else {
    candidates = [
      { family: 'Noto Sans SC' },
      { family: 'Source Han Sans SC' },
      { family: 'WenQuanYi Zen Hei' },
      { family: 'PingFang SC' },
    ];
  }

  for (const candidate of candidates) {
    if (!candidate.file || fs.existsSync(candidate.file)) {
      return candidate;
    }
  }

  return { family: 'sans-serif' };
}

export function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function generateSrt(subtitles: Subtitle[]): string {
  return subtitles
    .map((s, i) => `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text}\n`)
    .join('\n');
}

function remapIntervalToKeepSegments(
  start: number,
  end: number,
  keepSegments: DeleteSegment[]
): DeleteSegment[] {
  const out: DeleteSegment[] = [];
  let cumulative = 0;
  
  for (const seg of keepSegments) {
    const overlapStart = Math.max(start, seg.start);
    const overlapEnd = Math.min(end, seg.end);
    if (overlapEnd > overlapStart) {
      out.push({
        start: cumulative + (overlapStart - seg.start),
        end: cumulative + (overlapEnd - seg.start),
      });
    }
    cumulative += seg.end - seg.start;
  }
  
  return out;
}

export function buildSubtitlesFromEditedOpted(
  editedOpted: Utterance[],
  audioOffset: number,
  keepSegments: DeleteSegment[]
): Subtitle[] {
  const sourceSubs: Subtitle[] = [];
  
  for (const node of editedOpted) {
    if (Array.isArray(node.words) && node.words.length > 0) {
      const keptWords: Subtitle[] = [];
      for (const w of node.words) {
        if ((w.opt || node.opt || 'keep') === 'del') continue;
        const text = (w.text || '').trim();
        if (!text) continue;
        keptWords.push({
          text,
          start: (typeof w.start_time === 'number' ? w.start_time : node.start_time || 0) / 1000 - audioOffset,
          end: (typeof w.end_time === 'number' ? w.end_time : node.end_time || 0) / 1000 - audioOffset,
        });
      }
      if (keptWords.length > 0) {
        sourceSubs.push({
          text: keptWords.map((w) => w.text).join(''),
          start: keptWords[0].start,
          end: keptWords[keptWords.length - 1].end,
        });
      }
      continue;
    }

    if ((node.opt || 'keep') === 'del') continue;
    const text = (node.text || '').trim();
    if (!text) continue;
    sourceSubs.push({
      text,
      start: (node.start_time || 0) / 1000 - audioOffset,
      end: (node.end_time || 0) / 1000 - audioOffset,
    });
  }

  const remapped: Subtitle[] = [];
  for (const sub of sourceSubs) {
    for (const seg of remapIntervalToKeepSegments(sub.start, sub.end, keepSegments)) {
      if (seg.end - seg.start < 0.05) continue;
      remapped.push({ text: sub.text, start: seg.start, end: seg.end });
    }
  }
  
  return remapped;
}

export function burnSubtitles(
  videoPath: string,
  srtPath: string,
  outputPath: string,
  subtitleStyle?: SubtitleStylePreset
): void {
  const encoder = getPreferredEncoder();
  const font = resolveSubtitleFont();
  const escapedSrtPath = escapeFilterValue(srtPath);
  const escapedFontsDir = font.fontsDir ? escapeFilterValue(font.fontsDir) : null;
  const stylePreset = normalizeSubtitleStylePreset(subtitleStyle);
  const fontFamily = stylePreset.fontFamilyHint || font.family;
  const bold = stylePreset.fontWeight >= 600 ? -1 : 0;
  const shadow = Math.round(stylePreset.shadow * 10) / 10;
  const style = [
    `FontSize=${Math.round(stylePreset.fontSize * 10) / 10}`,
    `FontName=${escapeAssText(fontFamily)}`,
    `Bold=${bold}`,
    `Spacing=${Math.round(stylePreset.letterSpacing * 10) / 10}`,
    `PrimaryColour=${assColorFromHex(stylePreset.textColor)}`,
    `OutlineColour=${assColorFromHex(stylePreset.outlineColor)}`,
    `Outline=${Math.round(stylePreset.outlineWidth * 10) / 10}`,
    `Shadow=${shadow}`,
    'BorderStyle=1',
    `Alignment=${assAlignmentFromPreset(stylePreset.alignment)}`,
    `MarginV=${Math.round(stylePreset.bottomOffset)}`,
  ].join(',');
  const filterParts = [`subtitles='${escapedSrtPath}'`, 'charenc=UTF-8'];
  if (escapedFontsDir) {
    filterParts.push(`fontsdir='${escapedFontsDir}'`);
  }
  filterParts.push(`force_style='${style}'`);
  const filter = filterParts.join(':');
  console.log(`📝 烧录字幕使用编码器: ${encoder.label}`);
  console.log(`🔤 烧录字幕使用字体: ${fontFamily}${font.file ? ` (${font.file})` : ''}`);
  const cmd = `ffmpeg -y -i "file:${videoPath}" -vf "${filter}" -c:v ${encoder.name} ${encoder.args} -c:a copy "file:${outputPath}"`;
  execSync(cmd, { stdio: 'pipe', maxBuffer: 1024 * 1024 * 16 });
}
