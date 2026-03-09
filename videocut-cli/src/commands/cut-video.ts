import fs from 'fs';
import path from 'path';
import { cutVideo as doCutVideo, computeCutPlan } from '../core/video.js';
import type { DeleteSegment } from '../core/types.js';

export function cutVideo(
  videoPath: string,
  segmentsPath: string,
  options: { output?: string; project?: string }
): void {
  const videoFile = path.resolve(videoPath);
  const segmentsFile = path.resolve(segmentsPath);

  if (!fs.existsSync(videoFile)) {
    console.error(`❌ 找不到视频文件: ${videoFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(segmentsFile)) {
    console.error(`❌ 找不到片段文件: ${segmentsFile}`);
    process.exit(1);
  }

  const segments: DeleteSegment[] = JSON.parse(fs.readFileSync(segmentsFile, 'utf8'));
  if (!Array.isArray(segments) || segments.length === 0) {
    console.error('❌ 删除片段为空或格式错误');
    process.exit(1);
  }

  const baseName = path.basename(videoFile, '.mp4');
  const dir = path.dirname(videoFile);
  const outputFile = options.output || path.join(dir, `${baseName}_cut.mp4`);
  const projectPath = options.project;

  console.log(`📹 输入视频: ${videoFile}`);
  console.log(`📹 输出视频: ${outputFile}`);
  console.log(`✂️ 删除片段数: ${segments.length}`);

  const result = doCutVideo(videoFile, segments, outputFile, projectPath);

  console.log(`\n✅ 剪辑完成!`);
  console.log(`   原时长: ${result.originalDuration.toFixed(2)}s`);
  console.log(`   新时长: ${result.newDuration.toFixed(2)}s`);
  console.log(`   删除: ${(result.originalDuration - result.newDuration).toFixed(2)}s`);
}
