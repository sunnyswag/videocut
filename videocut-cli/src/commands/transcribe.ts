import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

  console.log('🎵 提取音频...');
  execSync(`ffmpeg -y -i "file:${videoFile}" -vn -acodec libmp3lame -q:a 2 "${audioPath}"`, { stdio: 'pipe' });
  console.log(`✅ 音频已保存: ${audioPath}`);

  console.log('📤 上传音频到临时存储...');
  const uploadCmd = `curl -s -X POST -F "file=@${audioPath}" https://uguu.se/upload`;
  const uploadResult = execSync(uploadCmd).toString();
  const audioUrlMatch = uploadResult.match(/https:\/\/[^\s"]+\.mp3/);
  if (!audioUrlMatch) {
    console.error('❌ 上传音频失败');
    process.exit(1);
  }
  const audioUrl = audioUrlMatch[0];
  console.log(`✅ 音频URL: ${audioUrl}`);

  const appId = process.env.VOLCENGINE_APP_ID;
  const accessToken = process.env.VOLCENGINE_ACCESS_TOKEN;
  if (!appId || !accessToken) {
    console.error('❌ 请设置环境变量 VOLCENGINE_APP_ID 和 VOLCENGINE_ACCESS_TOKEN');
    process.exit(1);
  }

  console.log('🎤 调用火山引擎转录...');
  const requestBody = {
    app: { appid: appId, cluster: 'volcengine_streaming_common' },
    user: { uid: 'videocut' },
    audio: { url: audioUrl, format: 'mp3' },
    request: {
      model_name: 'bigmodel',
      show_utterances: true,
      result_type: 'single',
      show_words: true,
    },
  };

  const response = await fetch('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer; ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    console.error(`❌ 转录请求失败: ${response.status}`);
    process.exit(1);
  }

  const result = await response.json();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`✅ 转录结果已保存: ${resultPath}`);
}
