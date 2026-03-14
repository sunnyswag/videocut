import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SUBMIT_URL = 'https://openspeech.bytedance.com/api/v1/vc/submit';
const QUERY_URL = 'https://openspeech.bytedance.com/api/v1/vc/query';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function transcribe(
  videoPath: string,
  options: { output?: string }
): Promise<void> {
  const videoFile = path.resolve(videoPath);
  if (!fs.existsSync(videoFile)) {
    console.error(`❌ 找不到视频文件: ${videoFile}`);
    process.exit(1);
  }

  const baseDir = options.output || path.dirname(videoFile);
  const transcribeDir = path.join(baseDir, '1_transcribe');
  fs.mkdirSync(transcribeDir, { recursive: true });

  const audioPath = path.join(transcribeDir, 'audio.mp3');
  const resultPath = path.join(transcribeDir, 'volcengine_result.json');

  console.log(`📹 视频文件: ${videoFile}`);
  console.log(`📂 输出目录: ${transcribeDir}`);

  // 1. 提取音频
  console.log('🎵 提取音频...');
  execSync(`ffmpeg -y -i "file:${videoFile}" -vn -acodec libmp3lame -q:a 2 "${audioPath}"`, { stdio: 'pipe' });
  console.log(`✅ 音频已保存: ${audioPath}`);

  // 2. 上传到临时存储
  console.log('📤 上传音频到临时存储...');
  const uploadCmd = `curl -s -X POST -F "files[]=@${audioPath}" https://uguu.se/upload`;
  const uploadResult = execSync(uploadCmd, { encoding: 'utf8' });
  let audioUrl: string;
  try {
    const uploadJson = JSON.parse(uploadResult);
    if (!uploadJson.success || !uploadJson.files?.[0]?.url) {
      throw new Error(uploadJson.description || 'Unknown upload error');
    }
    audioUrl = uploadJson.files[0].url;
  } catch (e: any) {
    console.error(`❌ 上传音频失败: ${e.message}`);
    console.error(`上传返回: ${uploadResult}`);
    process.exit(1);
  }
  console.log(`✅ 音频URL: ${audioUrl}`);

  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    console.error('❌ 请设置环境变量 VOLCENGINE_API_KEY');
    process.exit(1);
  }

  // 3. 提交火山引擎转录任务
  console.log('🎤 提交火山引擎转录任务...');
  const submitParams = new URLSearchParams({
    language: 'zh-CN',
    use_itn: 'True',
    use_capitalize: 'True',
    max_lines: '1',
    words_per_line: '15',
  });

  const submitResponse = await fetch(`${SUBMIT_URL}?${submitParams}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ url: audioUrl }),
  });

  if (!submitResponse.ok) {
    const errBody = await submitResponse.text();
    console.error(`❌ 提交任务失败: ${submitResponse.status}`);
    console.error(`响应: ${errBody}`);
    process.exit(1);
  }

  const submitResult = await submitResponse.json() as any;
  const taskId = submitResult.id;
  if (!taskId) {
    console.error('❌ 提交失败，未获取到任务 ID');
    console.error(`响应: ${JSON.stringify(submitResult)}`);
    process.exit(1);
  }
  console.log(`✅ 任务已提交，ID: ${taskId}`);

  // 4. 轮询查询结果
  console.log('⏳ 等待转录完成...');
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const queryResponse = await fetch(`${QUERY_URL}?id=${taskId}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!queryResponse.ok) {
      console.error(`❌ 查询失败: ${queryResponse.status}`);
      process.exit(1);
    }

    const queryResult = await queryResponse.json() as any;
    const code = queryResult.code;

    if (code === 0) {
      fs.writeFileSync(resultPath, JSON.stringify(queryResult, null, 2));
      const utteranceCount = queryResult.utterances?.length ?? 0;
      console.log(`\n✅ 转录完成，已保存: ${resultPath}`);
      console.log(`📝 识别到 ${utteranceCount} 段语音`);
      return;
    } else if (code === 1000) {
      process.stdout.write('.');
    } else {
      console.error(`\n❌ 转录失败 (code=${code})`);
      console.error(`响应: ${JSON.stringify(queryResult)}`);
      process.exit(1);
    }
  }

  console.error('\n❌ 转录超时，任务未完成');
  process.exit(1);
}
