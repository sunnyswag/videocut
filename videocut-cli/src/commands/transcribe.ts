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
  options: { output?: string; hotwords?: string }
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
  let hotwords: string[] = [];

  if (options.hotwords) {
    const hotwordsPath = path.resolve(options.hotwords);
    if (!fs.existsSync(hotwordsPath)) {
      console.error(`❌ 找不到热词文件: ${hotwordsPath}`);
      process.exit(1);
    }
    const rawHotwords = fs.readFileSync(hotwordsPath, 'utf8');
    hotwords = rawHotwords
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    if (hotwords.length === 0) {
      console.warn(`⚠️ 热词文件为空或仅包含注释: ${hotwordsPath}`);
    } else {
      console.log(`🔥 已加载热词 ${hotwords.length} 条: ${hotwordsPath}`);
      fs.writeFileSync(path.join(transcribeDir, 'hotwords_used.json'), JSON.stringify(hotwords, null, 2));
    }
  }

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

  const submitWithPayload = async (payload: Record<string, unknown>) =>
    fetch(`${SUBMIT_URL}?${submitParams}`, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

  let submitResponse: Response;
  if (hotwords.length > 0) {
    // Volcengine expects `hot_words` as an array of objects, not string array.
    const hotwordPayload = hotwords.map((word) => ({ word }));
    submitResponse = await submitWithPayload({ url: audioUrl, hot_words: hotwordPayload });
    if (!submitResponse.ok) {
      const errBody = await submitResponse.text();
      console.warn(`⚠️ 热词提交失败，回退为普通转写: ${submitResponse.status}`);
      console.warn(`响应: ${errBody}`);
      submitResponse = await submitWithPayload({ url: audioUrl });
    }
  } else {
    submitResponse = await submitWithPayload({ url: audioUrl });
  }

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
