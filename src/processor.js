// src/processor.js - 영상 처리 핵심 파이프라인 (양방향 다국어 + 롱폼/쇼츠 + 자막 스타일)

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

// ===== 지원 언어 정의 =====
const LANGUAGES = {
  ko: { name: '한국어', whisper: 'ko', voice: 'ko-KR-SunHiNeural', fontFile: 'malgun.ttf' },
  en: { name: 'English', whisper: 'en', voice: 'en-US-AriaNeural', fontFile: 'arial.ttf' },
  ja: { name: '日本語', whisper: 'ja', voice: 'ja-JP-NanamiNeural', fontFile: 'YuGothM.ttc' },
  zh: { name: '中文', whisper: 'zh', voice: 'zh-CN-XiaoxiaoNeural', fontFile: 'msyh.ttc' },
  es: { name: 'Español', whisper: 'es', voice: 'es-ES-ElviraNeural', fontFile: 'arial.ttf' },
  fr: { name: 'Français', whisper: 'fr', voice: 'fr-FR-DeniseNeural', fontFile: 'arial.ttf' },
  de: { name: 'Deutsch', whisper: 'de', voice: 'de-DE-KatjaNeural', fontFile: 'arial.ttf' },
  it: { name: 'Italiano', whisper: 'it', voice: 'it-IT-ElsaNeural', fontFile: 'arial.ttf' },
  pt: { name: 'Português', whisper: 'pt', voice: 'pt-BR-FranciscaNeural', fontFile: 'arial.ttf' },
  ru: { name: 'Русский', whisper: 'ru', voice: 'ru-RU-SvetlanaNeural', fontFile: 'arial.ttf' },
  vi: { name: 'Tiếng Việt', whisper: 'vi', voice: 'vi-VN-HoaiMyNeural', fontFile: 'arial.ttf' },
  th: { name: 'ภาษาไทย', whisper: 'th', voice: 'th-TH-PremwadeeNeural', fontFile: 'arial.ttf' },
};

// ===== 각 언어별 사용 가능한 TTS 목소리 카탈로그 =====
// Edge TTS 무료 제공 - 실제 voice ID와 표시명
const VOICE_CATALOG = {
  ko: [
    { id: 'ko-KR-SunHiNeural',  name: '선희',    gender: 'F', style: '청년, 밝음', recommend: true },
    { id: 'ko-KR-JiMinNeural',  name: '지민',    gender: 'F', style: '청년, 친근' },
    { id: 'ko-KR-SeoHyeonNeural', name: '서현',   gender: 'F', style: '성인, 차분' },
    { id: 'ko-KR-YuJinNeural',  name: '유진',    gender: 'F', style: '청년, 발랄' },
    { id: 'ko-KR-SoonBokNeural', name: '순복',   gender: 'F', style: '노년, 따뜻' },
    { id: 'ko-KR-InJoonNeural', name: '인준',    gender: 'M', style: '청년, 깔끔' },
    { id: 'ko-KR-HyunsuNeural', name: '현수',    gender: 'M', style: '청년, 부드러움' },
    { id: 'ko-KR-BongJinNeural', name: '봉진',   gender: 'M', style: '중년, 안정' },
    { id: 'ko-KR-GookMinNeural', name: '국민',   gender: 'M', style: '성인, 신뢰' },
  ],
  en: [
    { id: 'en-US-AriaNeural',       name: 'Aria',     gender: 'F', style: 'News, professional', recommend: true },
    { id: 'en-US-JennyNeural',      name: 'Jenny',    gender: 'F', style: 'Friendly, casual' },
    { id: 'en-US-AmberNeural',      name: 'Amber',    gender: 'F', style: 'Warm, gentle' },
    { id: 'en-US-AshleyNeural',     name: 'Ashley',   gender: 'F', style: 'Young, energetic' },
    { id: 'en-US-CoraNeural',       name: 'Cora',     gender: 'F', style: 'Adult, calm' },
    { id: 'en-US-ElizabethNeural',  name: 'Elizabeth', gender: 'F', style: 'Adult, elegant' },
    { id: 'en-US-JaneNeural',       name: 'Jane',     gender: 'F', style: 'Young, clear' },
    { id: 'en-US-MichelleNeural',   name: 'Michelle', gender: 'F', style: 'Adult, pleasant' },
    { id: 'en-US-MonicaNeural',     name: 'Monica',   gender: 'F', style: 'Adult, natural' },
    { id: 'en-US-NancyNeural',      name: 'Nancy',    gender: 'F', style: 'Adult, smooth' },
    { id: 'en-US-SaraNeural',       name: 'Sara',     gender: 'F', style: 'Young, cheerful' },
    { id: 'en-US-GuyNeural',        name: 'Guy',      gender: 'M', style: 'Deep, authoritative' },
    { id: 'en-US-DavisNeural',      name: 'Davis',    gender: 'M', style: 'Casual, friendly' },
    { id: 'en-US-BrandonNeural',    name: 'Brandon',  gender: 'M', style: 'Young, energetic' },
    { id: 'en-US-ChristopherNeural', name: 'Christopher', gender: 'M', style: 'Adult, clear' },
    { id: 'en-US-EricNeural',       name: 'Eric',     gender: 'M', style: 'Middle-aged, calm' },
    { id: 'en-US-JacobNeural',      name: 'Jacob',    gender: 'M', style: 'Young, bright' },
    { id: 'en-US-JasonNeural',      name: 'Jason',    gender: 'M', style: 'Young, confident' },
    { id: 'en-US-RogerNeural',      name: 'Roger',    gender: 'M', style: 'Adult, warm' },
    { id: 'en-US-SteffanNeural',    name: 'Steffan',  gender: 'M', style: 'Adult, neutral' },
    { id: 'en-US-TonyNeural',       name: 'Tony',     gender: 'M', style: 'Adult, strong' },
    { id: 'en-GB-SoniaNeural',      name: 'Sonia (UK)', gender: 'F', style: 'British, elegant' },
    { id: 'en-GB-LibbyNeural',      name: 'Libby (UK)', gender: 'F', style: 'British, friendly' },
    { id: 'en-GB-RyanNeural',       name: 'Ryan (UK)',  gender: 'M', style: 'British, adult' },
    { id: 'en-GB-AlfieNeural',      name: 'Alfie (UK)', gender: 'M', style: 'British, young' },
  ],
  ja: [
    { id: 'ja-JP-NanamiNeural', name: 'Nanami',  gender: 'F', style: '청년, 친근', recommend: true },
    { id: 'ja-JP-AoiNeural',    name: 'Aoi',     gender: 'F', style: '어린이' },
    { id: 'ja-JP-MayuNeural',   name: 'Mayu',    gender: 'F', style: '성인, 차분' },
    { id: 'ja-JP-ShioriNeural', name: 'Shiori',  gender: 'F', style: '성인, 부드러움' },
    { id: 'ja-JP-KeitaNeural',  name: 'Keita',   gender: 'M', style: '청년, 깔끔' },
    { id: 'ja-JP-DaichiNeural', name: 'Daichi',  gender: 'M', style: '성인, 신뢰' },
    { id: 'ja-JP-NaokiNeural',  name: 'Naoki',   gender: 'M', style: '중년, 안정' },
  ],
  zh: [
    { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', gender: 'F', style: '청년, 밝음', recommend: true },
    { id: 'zh-CN-XiaoyiNeural',   name: 'Xiaoyi',   gender: 'F', style: '청년, 친근' },
    { id: 'zh-CN-XiaochenNeural', name: 'Xiaochen', gender: 'F', style: '친근, 자연' },
    { id: 'zh-CN-XiaohanNeural',  name: 'Xiaohan',  gender: 'F', style: '따뜻함' },
    { id: 'zh-CN-XiaomengNeural', name: 'Xiaomeng', gender: 'F', style: '청년' },
    { id: 'zh-CN-XiaomoNeural',   name: 'Xiaomo',   gender: 'F', style: '성인' },
    { id: 'zh-CN-XiaoqiuNeural',  name: 'Xiaoqiu',  gender: 'F', style: '성인, 차분' },
    { id: 'zh-CN-XiaoruiNeural',  name: 'Xiaorui',  gender: 'F', style: '노년' },
    { id: 'zh-CN-XiaoyanNeural',  name: 'Xiaoyan',  gender: 'F', style: '성인' },
    { id: 'zh-CN-XiaozhenNeural', name: 'Xiaozhen', gender: 'F', style: '성인' },
    { id: 'zh-CN-YunxiNeural',    name: 'Yunxi',    gender: 'M', style: '청년' },
    { id: 'zh-CN-YunjianNeural',  name: 'Yunjian',  gender: 'M', style: '중년' },
    { id: 'zh-CN-YunyangNeural',  name: 'Yunyang',  gender: 'M', style: '뉴스, 신뢰' },
    { id: 'zh-CN-YunfengNeural',  name: 'Yunfeng',  gender: 'M', style: '성인' },
    { id: 'zh-CN-YunhaoNeural',   name: 'Yunhao',   gender: 'M', style: '성인' },
    { id: 'zh-CN-YunxiaNeural',   name: 'Yunxia',   gender: 'M', style: '청년' },
    { id: 'zh-CN-YunyeNeural',    name: 'Yunye',    gender: 'M', style: '성인' },
    { id: 'zh-CN-YunzeNeural',    name: 'Yunze',    gender: 'M', style: '중년' },
  ],
  es: [
    { id: 'es-ES-ElviraNeural',  name: 'Elvira',  gender: 'F', style: 'Spain, adult', recommend: true },
    { id: 'es-ES-AbrilNeural',   name: 'Abril',   gender: 'F', style: 'Spain, young' },
    { id: 'es-ES-AlvaroNeural',  name: 'Alvaro',  gender: 'M', style: 'Spain, adult' },
    { id: 'es-MX-DaliaNeural',   name: 'Dalia',   gender: 'F', style: 'Mexico, friendly' },
    { id: 'es-MX-JorgeNeural',   name: 'Jorge',   gender: 'M', style: 'Mexico, adult' },
  ],
  fr: [
    { id: 'fr-FR-DeniseNeural',  name: 'Denise',  gender: 'F', style: 'Adult, professional', recommend: true },
    { id: 'fr-FR-EloiseNeural',  name: 'Eloise',  gender: 'F', style: 'Child' },
    { id: 'fr-FR-JosephineNeural', name: 'Josephine', gender: 'F', style: 'Adult' },
    { id: 'fr-FR-HenriNeural',   name: 'Henri',   gender: 'M', style: 'Adult, warm' },
    { id: 'fr-FR-YvetteNeural',  name: 'Yvette',  gender: 'F', style: 'Adult' },
  ],
  de: [
    { id: 'de-DE-KatjaNeural',     name: 'Katja',     gender: 'F', style: 'Adult, professional', recommend: true },
    { id: 'de-DE-AmalaNeural',     name: 'Amala',     gender: 'F', style: 'Adult' },
    { id: 'de-DE-ConradNeural',    name: 'Conrad',    gender: 'M', style: 'Adult' },
    { id: 'de-DE-KillianNeural',   name: 'Killian',   gender: 'M', style: 'Adult' },
  ],
  it: [
    { id: 'it-IT-ElsaNeural',     name: 'Elsa',     gender: 'F', style: 'Adult', recommend: true },
    { id: 'it-IT-IsabellaNeural', name: 'Isabella', gender: 'F', style: 'Young' },
    { id: 'it-IT-DiegoNeural',    name: 'Diego',    gender: 'M', style: 'Adult' },
  ],
  pt: [
    { id: 'pt-BR-FranciscaNeural', name: 'Francisca', gender: 'F', style: 'Brazil, adult', recommend: true },
    { id: 'pt-BR-AntonioNeural',   name: 'Antonio',   gender: 'M', style: 'Brazil, adult' },
  ],
  ru: [
    { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana', gender: 'F', style: 'Adult', recommend: true },
    { id: 'ru-RU-DmitryNeural',   name: 'Dmitry',   gender: 'M', style: 'Adult' },
  ],
  vi: [
    { id: 'vi-VN-HoaiMyNeural',  name: 'HoaiMy',  gender: 'F', style: 'Adult', recommend: true },
    { id: 'vi-VN-NamMinhNeural', name: 'NamMinh', gender: 'M', style: 'Adult' },
  ],
  th: [
    { id: 'th-TH-PremwadeeNeural', name: 'Premwadee', gender: 'F', style: 'Adult', recommend: true },
    { id: 'th-TH-NiwatNeural',     name: 'Niwat',     gender: 'M', style: 'Adult' },
  ],
};

// ===== 드라마 각본 모드: 화자별 TTS 목소리 매핑 =====
// 태그: NARR(나레이터), F1~F3(여자 청년/성인/노년), M1~M3(남자 청년/성인/중년)
const DRAMA_VOICE_MAP = {
  ko: {
    NARR: 'ko-KR-GookMinNeural',    // 국민 - 중후한 나레이터
    F1:   'ko-KR-JiMinNeural',      // 지민 - 여자 청년 (친근)
    F2:   'ko-KR-SeoHyeonNeural',   // 서현 - 여자 성인 (차분)
    F3:   'ko-KR-SoonBokNeural',    // 순복 - 여자 노년 (따뜻)
    M1:   'ko-KR-InJoonNeural',     // 인준 - 남자 청년 (깔끔)
    M2:   'ko-KR-HyunsuNeural',     // 현수 - 남자 성인 (부드러움)
    M3:   'ko-KR-BongJinNeural',    // 봉진 - 남자 중년 (안정)
  },
  en: {
    NARR: 'en-US-GuyNeural',        // Guy - 중후한 나레이터
    F1:   'en-US-AshleyNeural',     // Ashley - 여자 청년
    F2:   'en-US-JennyNeural',      // Jenny - 여자 성인
    F3:   'en-US-NancyNeural',      // Nancy - 여자 성숙
    M1:   'en-US-BrandonNeural',    // Brandon - 남자 청년
    M2:   'en-US-DavisNeural',      // Davis - 남자 성인
    M3:   'en-US-RogerNeural',      // Roger - 남자 성숙
  },
  ja: {
    NARR: 'ja-JP-DaichiNeural',     // Daichi - 나레이터
    F1:   'ja-JP-NanamiNeural',     // Nanami - 여자 청년
    F2:   'ja-JP-MayuNeural',       // Mayu - 여자 성인
    F3:   'ja-JP-ShioriNeural',     // Shiori - 여자 성숙
    M1:   'ja-JP-KeitaNeural',      // Keita - 남자 청년
    M2:   'ja-JP-DaichiNeural',     // Daichi - 남자 성인
    M3:   'ja-JP-NaokiNeural',      // Naoki - 남자 중년
  },
  zh: {
    NARR: 'zh-CN-YunjianNeural',    // Yunjian - 중후한 나레이터
    F1:   'zh-CN-XiaoyiNeural',     // Xiaoyi - 여자 청년
    F2:   'zh-CN-XiaoxiaoNeural',   // Xiaoxiao - 여자 성인
    F3:   'zh-CN-XiaoruiNeural',    // Xiaorui - 여자 노년
    M1:   'zh-CN-YunxiNeural',      // Yunxi - 남자 청년
    M2:   'zh-CN-YunyangNeural',    // Yunyang - 남자 성인
    M3:   'zh-CN-YunjianNeural',    // Yunjian - 남자 중년
  },
  es: {
    NARR: 'es-ES-AlvaroNeural',
    F1:   'es-ES-AbrilNeural',
    F2:   'es-ES-ElviraNeural',
    F3:   'es-MX-DaliaNeural',
    M1:   'es-MX-JorgeNeural',
    M2:   'es-ES-AlvaroNeural',
    M3:   'es-ES-AlvaroNeural',
  },
};

// 태그 파싱: "[NARR] 텍스트" / "[F1] 텍스트" / "[M2] 텍스트"
// 마크다운 감싸기, 콜론, 공백 변형 다 허용
function parseSpeakerTag(line) {
  // 라인 앞뒤 **, *, - 등 제거 후 파싱
  let cleaned = line.trim()
    .replace(/^\*+\s*/, '')       // 앞 ** 제거
    .replace(/\s*\*+$/, '')        // 뒤 ** 제거
    .replace(/^[-•]\s*/, '');      // 불릿 제거

  // 태그 매칭: [F1], [f1], [F1:], **[F1]**, [F1]:, 등
  const match = cleaned.match(/^\**\[(NARR|F[1-3]|M[1-3])\]\**\s*:?\s*(.+)$/i);
  if (match) {
    return { speaker: match[1].toUpperCase(), text: match[2].trim().replace(/\*+/g, '') };
  }
  return { speaker: 'NARR', text: cleaned.replace(/\*+/g, '') };
}

// ===== 자막 스타일 프리셋 =====
const SUBTITLE_PRESETS = {
  classic: {
    name: '클래식',
    // 🆕 외곽선 두껍게 (5→7) + 그림자 켜서 선명하게
    fontColor: 'white', borderColor: 'black', borderWidth: 7, fontSize: 54,
    bgEnabled: false, shadowEnabled: true, animation: 'none',
  },
  bold: {
    name: '굵은 강조',
    // 🆕 외곽선 더 두껍게 (8→10)
    fontColor: 'yellow', borderColor: 'black', borderWidth: 10, fontSize: 64,
    bgEnabled: false, shadowEnabled: true, animation: 'none',
  },
  shorts: {
    name: '쇼츠 박스',
    // 🆕 외곽선 두껍게 (3→5)
    fontColor: 'white', borderColor: 'black', borderWidth: 5, fontSize: 58,
    bgEnabled: true, bgColor: 'black@0.6', shadowEnabled: false, animation: 'fade',
  },
  cinematic: {
    name: '시네마틱',
    // 🆕 외곽선 두껍게 (2→5) + 그림자 유지
    fontColor: 'white', borderColor: 'black', borderWidth: 5, fontSize: 48,
    bgEnabled: false, shadowEnabled: true, animation: 'none',
  },
  vibrant: {
    name: '비비드 핑크',
    // 🆕 외곽선 두껍게 (6→8)
    fontColor: '#FF4FA0', borderColor: 'white', borderWidth: 8, fontSize: 60,
    bgEnabled: false, shadowEnabled: true, animation: 'none',
  },
  neon: {
    name: '네온 시안',
    // 🆕 외곽선 두껍게 (7→9)
    fontColor: '#00FFFF', borderColor: 'black', borderWidth: 9, fontSize: 60,
    bgEnabled: false, shadowEnabled: true, animation: 'fade',
  },
};

function toFFColor(color) {
  if (!color) return 'white';
  if (color.startsWith('#')) return '0x' + color.slice(1);
  return color;
}

// ===== 명령어 실행 =====
// 🆕 jobId를 전달하면 취소 시 강제 종료됨
// jobId 없으면 global.__currentProcessorJobId 사용 (자동 추적)
function runCommand(cmd, args, onStderr, jobId = null) {
  const effectiveJobId = jobId || global.__currentProcessorJobId || null;
  
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    
    // 🆕 jobId가 있으면 글로벌 레지스트리에 등록 (취소 시 kill 가능)
    if (effectiveJobId && typeof global.registerChildProcess === 'function') {
      global.registerChildProcess(effectiveJobId, proc);
    }
    
    // 🆕 프로세스 시작 시각 (하트비트용)
    const startTime = Date.now();
    let lastStderrTime = Date.now();
    
    // 🆕 하트비트: 10초마다 실행 중임을 알림 (mainWindow로)
    // ffmpeg가 오래 걸리는 작업 때 "멈춘 줄" 알지 말라고
    const heartbeatInterval = setInterval(() => {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      const stallSec = Math.round((Date.now() - lastStderrTime) / 1000);
      
      // 글로벌 mainWindow에 하트비트 전송
      if (global.__mainWindow && !global.__mainWindow.isDestroyed() && effectiveJobId) {
        global.__mainWindow.webContents.send('progress-update', {
          jobId: effectiveJobId,
          stage: 'running',
          // percent는 건드리지 않음 (기존 progress 유지)
          message: stallSec > 20 
            ? `⚙️ ${cmd.replace('.exe', '')} 실행 중 (${elapsedSec}초 경과, 응답 없음)...`
            : `⚙️ ${cmd.replace('.exe', '')} 실행 중 (${elapsedSec}초 경과)...`,
          heartbeat: true,  // 하트비트 표시 (percent 덮어쓰기 X)
        });
      }
    }, 10000);  // 10초마다
    
    // 🆕 타임아웃: 3분 동안 아무 응답 없으면 강제 종료
    // yt-dlp가 TikTok 등에서 멈추는 경우 방지
    const TIMEOUT_MS = 3 * 60 * 1000; // 3분
    const timeoutInterval = setInterval(() => {
      const stallSec = Math.round((Date.now() - lastStderrTime) / 1000);
      if (stallSec > 180) { // 3분 이상 응답 없음
        console.error(`[runCommand] ⚠️ ${cmd} 타임아웃! 3분간 응답 없음 → 강제 종료`);
        clearInterval(heartbeatInterval);
        clearInterval(timeoutInterval);
        try { proc.kill('SIGKILL'); } catch (e) {}
      }
    }, 30000); // 30초마다 체크
    
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      lastStderrTime = Date.now();  // 🆕 응답 받은 시각 기록
      if (onStderr) onStderr(text);
    });
    proc.on('error', (err) => {
      clearInterval(heartbeatInterval);
      clearInterval(timeoutInterval);
      reject(err);
    });
    proc.on('close', (code, signal) => {
      clearInterval(heartbeatInterval);
      clearInterval(timeoutInterval);
      
      // 🆕 강제 종료된 경우
      if (signal === 'SIGKILL' || signal === 'SIGTERM') {
        reject(new Error('CANCELLED_BY_USER'));
        return;
      }
      if (code === 0) resolve({ stdout, stderr });
      else if (code === null) {
        // Windows에서 taskkill로 종료되면 code가 null
        reject(new Error('CANCELLED_BY_USER'));
      }
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr.slice(-1000)}`));
    });
  });
}

// ===== 1단계: yt-dlp 다운로드 =====
async function downloadVideo(url, outputPath, onProgress) {
  onProgress('download', 5, '영상 다운로드 중...');
  const ytdlp = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  await runCommand(ytdlp, [
    url, '-o', outputPath, '-f', 'best[ext=mp4]/best',
    '--no-playlist', '--quiet', '--progress',
    // 🆕 타임아웃 + 재시도 옵션 (TikTok 대응)
    '--socket-timeout', '60',           // 소켓 타임아웃 60초
    '--retries', '3',                    // 3번 재시도
    '--fragment-retries', '3',           // 프래그먼트 3번 재시도
    '--concurrent-fragments', '1',       // 동시 다운로드 1개 (안정성)
  ], (text) => {
    const m = text.match(/(\d+\.\d+)%/);
    if (m) onProgress('download', 5 + parseFloat(m[1]) * 0.15, `다운로드 ${parseFloat(m[1]).toFixed(0)}%`);
  });
  if (!fs.existsSync(outputPath)) throw new Error('영상 다운로드 실패');
  return outputPath;
}

// ===== 오디오 없는 영상용 AI 대본 생성 =====
async function generateScriptForMuteVideo(videoPath, duration, config, onProgress) {
  const apiKey = config.openaiApiKey || config.groqApiKey;
  const useOpenAI = !!config.openaiApiKey;
  
  // 영상에서 프레임 추출 (5초 간격)
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const jobDir = path.dirname(videoPath);
  const framesDir = path.join(jobDir, 'frames');
  
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  
  onProgress('stt', 32, '영상 프레임 분석 중...');
  
  // 5초 간격으로 프레임 추출 (최대 10장)
  const interval = Math.max(5, duration / 10);
  try {
    await runCommand(ffmpeg, [
      '-y', '-i', videoPath,
      '-vf', `fps=1/${interval}`,
      '-frames:v', '10',
      '-q:v', '2',
      path.join(framesDir, 'frame_%02d.jpg')
    ]);
  } catch (e) {
    console.log('[generateScriptForMuteVideo] 프레임 추출 실패:', e.message);
  }
  
  // 추출된 프레임 읽기
  const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
  let frameDescriptions = [];
  
  if (frameFiles.length > 0 && useOpenAI) {
    // OpenAI Vision으로 프레임 분석
    onProgress('stt', 35, '🖼️ AI가 영상 내용 분석 중...');
    
    for (let i = 0; i < Math.min(frameFiles.length, 5); i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const frameData = fs.readFileSync(framePath).toString('base64');
      
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: '이 영상 프레임에서 보이는 내용을 한국어로 간단히 설명해주세요. (1-2문장)' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frameData}` } }
              ]
            }],
            max_tokens: 100,
          },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
        );
        
        const desc = response.data.choices?.[0]?.message?.content?.trim();
        if (desc) frameDescriptions.push(desc);
      } catch (e) {
        console.log('[generateScriptForMuteVideo] 프레임 분석 실패:', e.message);
      }
    }
  }
  
  // AI로 대본 생성
  onProgress('stt', 38, '📝 AI 대본 생성 중...');
  
  const videoType = config.videoType || 'talking';
  const targetLang = config.targetLang || 'ko';
  const langName = LANGUAGES[targetLang]?.name || '한국어';
  
  let contextPrompt = '';
  if (frameDescriptions.length > 0) {
    contextPrompt = `\n\n영상 내용 (프레임 분석):\n${frameDescriptions.map((d, i) => `- ${i+1}번 장면: ${d}`).join('\n')}`;
  }
  
  const systemPrompt = `당신은 영상 나레이션 작가입니다.
오디오가 없는 ${duration.toFixed(1)}초 길이의 영상에 어울리는 나레이션 대본을 작성해주세요.

조건:
- 언어: ${langName}
- 영상 타입: ${videoType === 'product' ? '제품/쇼핑 소개' : videoType === 'reaction' ? '리액션/예능' : '일반 영상'}
- 자연스럽고 ${videoType === 'product' ? '설득력 있는' : '흥미로운'} 톤
- 영상 길이에 맞게 적절한 분량
${contextPrompt}

JSON 형식으로 응답:
{
  "fullText": "전체 나레이션 텍스트",
  "segments": [
    {"start": 0, "end": 3, "text": "첫 번째 문장"},
    {"start": 3, "end": 6, "text": "두 번째 문장"},
    ...
  ]
}`;

  const endpoint = useOpenAI 
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
  
  const model = useOpenAI ? 'gpt-4o-mini' : 'llama-3.3-70b-versatile';
  
  try {
    const response = await axios.post(
      endpoint,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${duration.toFixed(1)}초 영상에 맞는 나레이션을 작성해주세요.` }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    
    const content = response.data.choices?.[0]?.message?.content || '';
    
    // JSON 파싱
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        fullText: parsed.fullText || '',
        segments: (parsed.segments || []).map(s => ({
          start: parseFloat(s.start) || 0,
          end: parseFloat(s.end) || 0,
          text: s.text || '',
        })),
      };
    }
    
    // JSON 파싱 실패 시 기본 대본
    const defaultText = videoType === 'product' 
      ? '지금 바로 확인해보세요. 놓치면 후회할 특별한 기회입니다.'
      : '영상을 끝까지 시청해주세요.';
    
    return {
      fullText: defaultText,
      segments: [{ start: 0, end: duration, text: defaultText }],
    };
    
  } catch (e) {
    console.log('[generateScriptForMuteVideo] AI 대본 생성 실패:', e.message);
    
    // 실패 시 기본 대본
    const defaultText = '영상을 시청해주세요.';
    return {
      fullText: defaultText,
      segments: [{ start: 0, end: duration, text: defaultText }],
    };
  }
}

// ===== 2단계: 오디오 추출 =====
async function extractAudio(videoPath, audioPath, onProgress, config = {}) {
  onProgress('audio', 20, '오디오 추출 중...');
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  // 먼저 오디오 추출 시도
  try {
    await runCommand(ffmpeg, [
      '-y', '-i', videoPath, '-vn', '-acodec', 'libmp3lame',
      '-ar', '16000', '-ac', '1', '-b:a', '32k', audioPath,
    ]);
    
    // 추출 성공 - 파일이 제대로 생성됐는지 확인
    if (fs.existsSync(audioPath)) {
      const stats = fs.statSync(audioPath);
      if (stats.size > 1000) {
        // 1KB 이상이면 정상
        console.log('[extractAudio] 오디오 추출 성공:', stats.size, 'bytes');
        return audioPath;
      }
    }
    
    // 파일이 너무 작으면 오디오 없는 것으로 간주
    console.log('[extractAudio] 오디오 파일 너무 작음 - 오디오 없음 처리');
    config.__noAudio = true;
    
  } catch (e) {
    // 추출 실패 = 오디오 없음
    console.log('[extractAudio] 오디오 추출 실패:', e.message);
    config.__noAudio = true;
  }
  
  // 오디오 없으면 무음 파일 생성 (TTS용)
  if (config.__noAudio) {
    const duration = await getMediaDuration(videoPath);
    await runCommand(ffmpeg, [
      '-y', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono',
      '-t', String(duration),
      '-acodec', 'libmp3lame', '-b:a', '32k',
      audioPath
    ]);
  }
  
  return audioPath;
}

// ===== 3단계: Groq Whisper STT =====
async function transcribeAudio(audioPath, sourceLang, groqApiKey, onProgress, maxRetries = 6) {
  onProgress('stt', 30, '음성 인식 중 (Whisper)...');

  // 오디오 파일 정보 로그
  try {
    const stats = fs.statSync(audioPath);
    console.log(`[Whisper] 오디오 파일: ${audioPath}, 크기: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  } catch (e) {}

  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(audioPath));
      form.append('model', 'whisper-large-v3-turbo'); // turbo 버전 사용 (더 빠르고 안정적)
      form.append('response_format', 'verbose_json');
      form.append('temperature', '0'); // 정확도 최대화
      if (sourceLang && sourceLang !== 'auto' && LANGUAGES[sourceLang]) {
        form.append('language', LANGUAGES[sourceLang].whisper);
      }

      const response = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        form,
        {
          headers: { ...form.getHeaders(), Authorization: `Bearer ${groqApiKey}` },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 180000, // 3분 타임아웃 (긴 영상 대비)
        }
      );
      
      const segments = response.data.segments || [];
      const lastSeg = segments[segments.length - 1];
      console.log(`[Whisper] 인식 완료: ${segments.length}개 세그먼트, 언어: ${response.data.language}`);
      console.log(`[Whisper] 전체 텍스트 길이: ${response.data.text?.length || 0}자`);
      if (lastSeg) {
        console.log(`[Whisper] 마지막 세그먼트: ${lastSeg.end?.toFixed(2)}초 - "${lastSeg.text?.substring(0, 50)}..."`);
      }
      
      return {
        text: response.data.text,
        language: response.data.language,
        segments: segments,
        duration: response.data.duration,
      };
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        const retryAfter = error.response?.headers?.['retry-after'];
        let waitSec;
        if (retryAfter) {
          waitSec = parseFloat(retryAfter) + 2;
        } else {
          const waitTable = [10, 20, 40, 60, 90, 90];
          waitSec = waitTable[Math.min(attempt, waitTable.length - 1)];
        }
        const waitMs = Math.min(waitSec * 1000, 120000);
        onProgress('stt', 30, `Groq 한도 대기 중 (${waitSec}초)... ${attempt + 1}/${maxRetries}`);
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ===== sleep 헬퍼 =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== LLM Provider 시스템 =====
// 각 provider는 같은 인터페이스로 호출. 사용자 설정에 따라 자동 선택.
const LLM_PROVIDERS = {
  groq: {
    name: 'Groq (무료, 빠름)',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    keyField: 'groqApiKey',
    buildPayload: (messages, model) => ({
      model: model || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.3,
      max_tokens: 6000,
    }),
    buildHeaders: (key) => ({
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    }),
    parseResponse: (data) => data.choices[0].message.content.trim(),
  },
  openai: {
    name: 'OpenAI (GPT-4o)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    keyField: 'openaiApiKey',
    buildPayload: (messages, model) => ({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      max_tokens: 6000,
    }),
    buildHeaders: (key) => ({
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    }),
    parseResponse: (data) => data.choices[0].message.content.trim(),
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-haiku-20241022',
    keyField: 'anthropicApiKey',
    buildPayload: (messages, model) => {
      // Claude API는 system을 별도 필드로 받음
      const systemMsg = messages.find(m => m.role === 'system');
      const userMsgs = messages.filter(m => m.role !== 'system');
      return {
        model: model || 'claude-3-5-haiku-20241022',
        max_tokens: 6000,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: userMsgs,
      };
    },
    buildHeaders: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    parseResponse: (data) => data.content[0].text.trim(),
  },
  gemini: {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.0-flash',
    keyField: 'geminiApiKey',
    buildPayload: (messages, model) => {
      // Gemini 형식은 좀 다름
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      const systemMsg = messages.find(m => m.role === 'system');
      return {
        contents,
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
        generationConfig: { temperature: 0.3, maxOutputTokens: 6000 },
      };
    },
    buildHeaders: () => ({ 'Content-Type': 'application/json' }),
    parseResponse: (data) => data.candidates[0].content.parts[0].text.trim(),
    // Gemini는 URL에 키를 붙임
    getEndpoint: (model, key) => `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${key}`,
  },
};

// ===== 통합 LLM 호출 (자동 재시도 + Rate limit 대응) =====
async function callLLM(messages, config, maxRetries = 8) {
  const providerKey = config.llmProvider || 'groq';
  const provider = LLM_PROVIDERS[providerKey];
  if (!provider) throw new Error(`알 수 없는 LLM provider: ${providerKey}`);

  const apiKey = config[provider.keyField];
  if (!apiKey) throw new Error(`${provider.name} API 키가 설정되지 않았습니다. 설정 탭에서 입력하세요.`);

  const model = config.llmModel || provider.defaultModel;
  const payload = provider.buildPayload(messages, model);
  const headers = provider.buildHeaders(apiKey);
  const endpoint = provider.getEndpoint
    ? provider.getEndpoint(model, apiKey)
    : provider.endpoint;

  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(endpoint, payload, { headers });
      return provider.parseResponse(response.data);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        // Rate limit 재시도 전략:
        // retry-after 헤더가 있으면 그 시간만큼 대기
        // 없으면 점진적 증가: 10s, 20s, 40s, 60s, 90s, 90s, 90s, 90s
        const retryAfter = error.response?.headers?.['retry-after'];
        let waitSec;
        if (retryAfter) {
          waitSec = parseFloat(retryAfter) + 2; // retry-after + 2초 여유
        } else {
          // 점진적 증가
          const waitTable = [10, 20, 40, 60, 90, 90, 90, 90];
          waitSec = waitTable[Math.min(attempt, waitTable.length - 1)];
        }
        const waitMs = Math.min(waitSec * 1000, 120000); // 최대 2분
        console.log(`[LLM 429] ${waitSec}초 대기 후 재시도... (${attempt + 1}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ===== 세그먼트 단위 번역 (길이 제약 + 리듬감) =====
// 핵심: 원본 발화 시간에 맞는 "읽을 수 있는 길이"로 번역
// 한국어 기준: 1초당 약 7-8자 (공백 제외)
function getCharsPerSecond(lang) {
  // 언어별 초당 음절/글자 수 (자막 읽기 가능 속도 기준)
  // TTS rate +15% 감안해서 설정
  const rates = {
    ko: 7,    // 한국어
    ja: 7,    // 일본어
    zh: 5,    // 중국어 (글자 적음)
    en: 12,   // 영어
    es: 12,   // 스페인어
    fr: 12,   // 프랑스어
    de: 11,   // 독일어
    it: 12,   // 이탈리아어
    pt: 12,   // 포르투갈어
    ru: 11,   // 러시아어
    vi: 9,    // 베트남어
    th: 8,    // 태국어
  };
  return rates[lang] || 10;
}

/**
 * 🔴 스마트 정렬: 사용자 번역 대본을 Whisper 세그먼트에 맞춰 재분배
 * 대본 줄 수 != Whisper 세그먼트 수여도 동작
 * 
 * 🆕 lineToSegmentMap이 제공되면 "진짜" 원본 세그먼트 타이밍 사용 (립싱크 정확도 ↑)
 *   - map[i] = 대본 i번째 라인이 어느 원본 세그먼트에서 나왔는지
 *   - 여러 라인이 같은 원본 세그먼트를 가리키면 그 세그먼트를 글자수 비례로 등분
 * 
 * lineMap이 없으면 fallback: 세그먼트 쪼개기/합치기로 개수만 맞춤
 */
function alignScriptToWhisper(whisperSegments, scriptLines, lineToSegmentMap = null, videoDuration = null) {
  if (!whisperSegments?.length || !scriptLines?.length) return [];
  
    // 🆕 ===== 정확한 매핑 모드 =====
    // lineMap이 있고 길이도 맞으면 이걸 최우선 사용
    if (lineToSegmentMap && Array.isArray(lineToSegmentMap) && lineToSegmentMap.length === scriptLines.length) {
      console.log(`[align] 🎯 정확한 매핑 모드 사용 (lineMap ${lineToSegmentMap.length}개)`);
    
    // 같은 원본 세그먼트를 가리키는 라인들을 그룹화
    const groups = new Map(); // segIdx → [{lineIdx, text}, ...]
    scriptLines.forEach((text, lineIdx) => {
      const segIdx = lineToSegmentMap[lineIdx];
      if (segIdx === undefined || segIdx < 0 || segIdx >= whisperSegments.length) return;
      if (!groups.has(segIdx)) groups.set(segIdx, []);
      groups.get(segIdx).push({ lineIdx, text });
    });
    
    // 결과 배열 (lineIdx 순서 유지)
    const result = new Array(scriptLines.length);
    
    groups.forEach((lines, segIdx) => {
      const seg = whisperSegments[segIdx];
      const segStart = seg.start;
      const segEnd = seg.end;
      const segDur = segEnd - segStart;
      
      if (lines.length === 1) {
        // 1:1 → 원본 타이밍 그대로
        const { lineIdx, text } = lines[0];
        result[lineIdx] = {
          text,
          start: Number(segStart.toFixed(3)),
          end: Number(segEnd.toFixed(3)),
          duration: Number(segDur.toFixed(3)),
        };
      } else {
        // 🆕 여러 라인이 한 세그먼트에서 나옴
        // → 글자수 비례가 아니라 "거의 균등 분할" (한→영 길이차 문제 해결)
        // → 단, 매우 긴 라인은 조금 더 길게
        const n = lines.length;
        const evenDur = segDur / n;
        
        // 각 라인의 "기본 비율" = 균등(1/n), "보정 비율" = 글자수 비례
        // 두 비율의 가중평균(균등 70%, 글자수 30%) 으로 부드럽게
        const totalChars = lines.reduce((sum, l) => sum + l.text.length, 0) || n;
        
        const durations = lines.map(l => {
          const evenRatio = 1 / n;
          const charRatio = (l.text.length || 1) / totalChars;
          const mixedRatio = evenRatio * 0.7 + charRatio * 0.3;  // 균등 70%
          return segDur * mixedRatio;
        });
        
        // 합 보정 (반올림 오차)
        const sumDur = durations.reduce((s, d) => s + d, 0);
        const scale = segDur / sumDur;
        durations.forEach((d, i) => durations[i] = d * scale);
        
        let cursor = segStart;
        lines.forEach((l, idx) => {
          const start = cursor;
          const end = idx === lines.length - 1 ? segEnd : cursor + durations[idx];
          result[l.lineIdx] = {
            text: l.text,
            start: Number(start.toFixed(3)),
            end: Number(end.toFixed(3)),
            duration: Number((end - start).toFixed(3)),
          };
          cursor = end;
        });
      }
    });
    
    // 빠진 인덱스 보정 (혹시 mapping에서 누락된 라인)
    for (let i = 0; i < scriptLines.length; i++) {
      if (!result[i]) {
        // 이전 라인 끝 ~ 다음 라인 시작 사이에 배치 (간단 fallback)
        const prevEnd = i > 0 && result[i - 1] ? result[i - 1].end : whisperSegments[0].start;
        const next = result.slice(i + 1).find(Boolean);
        const nextStart = next ? next.start : whisperSegments[whisperSegments.length - 1].end;
        const dur = Math.max(0.5, (nextStart - prevEnd) / 2);
        result[i] = {
          text: scriptLines[i],
          start: Number(prevEnd.toFixed(3)),
          end: Number((prevEnd + dur).toFixed(3)),
          duration: Number(dur.toFixed(3)),
        };
      }
    }
    
    // 겹침/역전 방지 (시간순 정렬 후 시작시간이 이전 끝보다 작으면 밀어냄)
    for (let i = 1; i < result.length; i++) {
      if (result[i].start < result[i - 1].end) {
        result[i].start = result[i - 1].end;
        if (result[i].end < result[i].start) {
          result[i].end = result[i].start + 0.5;
        }
        result[i].duration = Number((result[i].end - result[i].start).toFixed(3));
      }
    }
    
    // 🆕 =====  갭 메우기 & 최소 표시 시간 보장 =====
    // "자막이 너무 훅훅 넘어간다"는 문제 해결
    // 각 자막의 end를 "다음 자막 시작"까지 연장해서 공백 시간 없애기
    // 🆕 글자수에 따라 최소 시간을 다르게 적용 (스마트)
    const getMinDuration = (text) => {
      const len = (text || '').length;
      if (len <= 3) return 0.8;   // 감탄사/짧은 말 ("아", "응", "네")
      if (len <= 6) return 1.2;   // 짧은 구절 ("내가", "그래서")
      if (len <= 12) return 1.5;  // 짧은 문장
      if (len <= 20) return 1.8;  // 보통 문장
      return 2.2;                 // 긴 문장 (읽을 시간 필요)
    };
    
    // 🆕 (이전) 립싱크 150ms 지연 → 대장님 피드백으로 제거
    // Whisper 시작 시간 그대로 사용 (쇼핑 쇼츠처럼 타이밍 신뢰)
    
    for (let i = 0; i < result.length; i++) {
      const cur = result[i];
      const next = result[i + 1];
      
      // 1) 다음 자막이 있으면 end를 다음 자막 시작 직전까지 연장
      //    → 자막 공백 없앰, 음성이 계속되는 동안 자막도 계속 표시
      if (next && cur.end < next.start) {
        cur.end = next.start;
      }
      
      // 2) 🆕 스마트 최소 표시 시간 (글자수 기반)
      const minDur = getMinDuration(cur.text);
      const dur = cur.end - cur.start;
      if (dur < minDur) {
        const needed = minDur - dur;
        // 다음 자막 시작을 침범하지 않는 선에서 연장
        const maxEnd = next ? next.start : cur.end + needed;
        cur.end = Math.min(cur.end + needed, maxEnd);
      }
      
      cur.duration = Number((cur.end - cur.start).toFixed(3));
      cur.start = Number(cur.start.toFixed(3));
      cur.end = Number(cur.end.toFixed(3));
    }
    
    // 🆕 🎯 마지막 자막을 영상 끝까지 연장 (끊김 방지!)
    // Whisper가 마지막 구간 짧게 잡는 경우가 많음
    // → 영상은 계속 돌아가는데 자막 없어서 허전함 해결
    if (videoDuration && videoDuration > 0 && result.length > 0) {
      const lastSeg = result[result.length - 1];
      if (lastSeg.end < videoDuration - 0.3) {
        // 마지막 자막 end 가 영상 끝보다 0.3초 이상 먼저 끝나면 연장
        const originalEnd = lastSeg.end;
        lastSeg.end = Number(videoDuration.toFixed(3));
        lastSeg.duration = Number((lastSeg.end - lastSeg.start).toFixed(3));
        console.log(`[align] 🎯 마지막 자막 연장: ${originalEnd}초 → ${lastSeg.end}초 (영상 끝까지)`);
      }
    }
    
    console.log(`[align] ✅ 정확한 매핑 완료: ${result.length}개 (갭메우기+스마트최소시간+마지막연장)`);
    return result;
  }
  
  // ===== Fallback 모드 (lineMap 없을 때) =====
  console.log(`[align] ⚠️ Fallback 모드 (lineMap 없음) - 세그먼트 쪼개기/합치기`);
  
  const N = scriptLines.length;
  
  // 세그먼트 복사 (원본 변경 방지)
  let adjusted = whisperSegments.map(s => ({
    start: s.start,
    end: s.end,
    duration: s.end - s.start
  }));
  
  // 대본이 더 많으면: 가장 긴 세그먼트를 쪼개기
  while (adjusted.length < N) {
    // 가장 긴 세그먼트 찾기
    let longestIdx = 0;
    for (let i = 1; i < adjusted.length; i++) {
      if (adjusted[i].duration > adjusted[longestIdx].duration) {
        longestIdx = i;
      }
    }
    
    const seg = adjusted[longestIdx];
    const mid = seg.start + seg.duration / 2;
    
    // 반으로 쪼개기
    adjusted.splice(longestIdx, 1,
      { start: seg.start, end: mid, duration: seg.duration / 2 },
      { start: mid, end: seg.end, duration: seg.duration / 2 }
    );
  }
  
  // 대본이 더 적으면: 가장 짧은 세그먼트를 이웃과 합치기
  while (adjusted.length > N) {
    // 가장 짧은 세그먼트 찾기
    let shortestIdx = 0;
    for (let i = 1; i < adjusted.length; i++) {
      if (adjusted[i].duration < adjusted[shortestIdx].duration) {
        shortestIdx = i;
      }
    }
    
    // 이웃과 합치기
    if (shortestIdx === 0) {
      // 첫 번째면 다음과 합침
      adjusted[1].start = adjusted[0].start;
      adjusted[1].duration = adjusted[1].end - adjusted[1].start;
      adjusted.splice(0, 1);
    } else if (shortestIdx === adjusted.length - 1) {
      // 마지막이면 이전과 합침
      adjusted[shortestIdx - 1].end = adjusted[shortestIdx].end;
      adjusted[shortestIdx - 1].duration = adjusted[shortestIdx - 1].end - adjusted[shortestIdx - 1].start;
      adjusted.splice(shortestIdx, 1);
    } else {
      // 중간이면 더 짧은 이웃과 합침
      const prev = adjusted[shortestIdx - 1];
      const next = adjusted[shortestIdx + 1];
      
      if (prev.duration <= next.duration) {
        prev.end = adjusted[shortestIdx].end;
        prev.duration = prev.end - prev.start;
      } else {
        next.start = adjusted[shortestIdx].start;
        next.duration = next.end - next.start;
      }
      adjusted.splice(shortestIdx, 1);
    }
  }
  
  // 최종 결과: 대본 텍스트 + 조정된 타이밍
  const finalResult = scriptLines.map((text, i) => ({
    text,
    start: Number(adjusted[i].start.toFixed(3)),
    end: Number(adjusted[i].end.toFixed(3)),
    duration: Number(adjusted[i].duration.toFixed(3))
  }));
  
  // 🆕 갭 메우기 & 스마트 최소 표시 시간 (fallback 모드에도 적용)
  const getMinDurationFb = (text) => {
    const len = (text || '').length;
    if (len <= 3) return 0.8;
    if (len <= 6) return 1.2;
    if (len <= 12) return 1.5;
    if (len <= 20) return 1.8;
    return 2.2;
  };
  
  for (let i = 0; i < finalResult.length; i++) {
    const cur = finalResult[i];
    const next = finalResult[i + 1];
    
    // 다음 자막까지 end 연장 (갭 없애기)
    if (next && cur.end < next.start) {
      cur.end = next.start;
    }
    
    // 스마트 최소 표시 시간 보장
    const minDur = getMinDurationFb(cur.text);
    const dur = cur.end - cur.start;
    if (dur < minDur) {
      const needed = minDur - dur;
      const maxEnd = next ? next.start : cur.end + needed;
      cur.end = Math.min(cur.end + needed, maxEnd);
    }
    
    cur.duration = Number((cur.end - cur.start).toFixed(3));
    cur.start = Number(cur.start.toFixed(3));
    cur.end = Number(cur.end.toFixed(3));
  }
  
  return finalResult;
}

async function translateSegments(segments, sourceLang, targetLang, mode, config, onProgress) {
  if (!segments || segments.length === 0) return [];
  const targetLangName = LANGUAGES[targetLang]?.name || targetLang;
  const sourceLangName = LANGUAGES[sourceLang]?.name || sourceLang;
  const cps = getCharsPerSecond(targetLang);

  const toneInstructions = {
    natural: '자연스럽고 깔끔한 말투',
    shopping: '친근하고 생생한 리뷰어 말투',
    comedy: '캐주얼하고 유머러스한 말투',
    info: '차분하고 명확한 정보 전달 말투',
  };
  const tone = toneInstructions[mode] || toneInstructions.natural;

  // 배치 크기 줄임 (시간 정보까지 포함되어 토큰 많음)
  const BATCH_SIZE = 20;
  const BATCH_DELAY_MS = config.llmProvider === 'groq' ? 3000 : 500;

  const results = [];
  const totalBatches = Math.ceil(segments.length / BATCH_SIZE);

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batchIdx = Math.floor(i / BATCH_SIZE);
    const batch = segments.slice(i, i + BATCH_SIZE);
    onProgress('translate', 45 + (i / segments.length) * 15,
      `번역 중 (${batchIdx + 1}/${totalBatches})`);

    // 각 세그먼트: [번호] (N초, 목표 N자) 원문
    // 주의: "최대"가 아니라 "목표" - LLM이 완결된 문장을 우선하도록
    const numbered = batch.map((s, idx) => {
      const duration = Math.max(0.5, s.end - s.start);
      const targetChars = Math.max(6, Math.floor(duration * cps * 1.1)); // 약간 여유
      return `[${idx + 1}] (${duration.toFixed(1)}초 / 목표 ${targetChars}자) ${s.text.trim()}`;
    }).join('\n');

    // 언어별 프롬프트 분기 - 예시까지 타겟 언어로 작성해야 LLM이 헷갈리지 않음
    let prompt;

    if (targetLang === 'ko') {
      // === 한국어 출력 ===
      prompt = `당신은 영상 자막 번역가입니다. ${sourceLangName}을 한국어로 정확하게 번역하세요.

**최우선 규칙 (순서대로):**
1. 🔴 **원문의 의미를 정확히 전달하세요.** 의역 금지, 창작 금지.
2. 🔴 **완결된 문장으로 끝내세요.** 중간에 자르지 마세요.
3. 🟡 가능하면 자연스럽고 간결하게 (딱딱한 번역체 금지)
4. 🟢 글자수 "목표"는 참고용입니다. 의미/완결성을 해치면 무시하세요.

**🔢 숫자 처리 (매우 중요):**
- 한국어 숫자 표기가 이상하면 정정하세요.
- ❌ "천이호" → ✅ "1002호"
- ❌ "천사복" → ✅ "1004호"
- ❌ "이천이십삼년" → ✅ "2023년"
- ❌ "삼만원" → ✅ "3만원"
- 호수, 연도, 가격, 전화번호, 주소 등 숫자가 명백한 경우 아라비아 숫자로
- 시청자가 명확히 읽을 수 있도록

**번역 원칙:**
- 원문에 있는 내용만 번역. 없는 내용 추가 금지.
- 원문에 없는 해석, 감정, 뉘앙스 덧붙이지 마세요.
- 고유명사(이름, 장소 등)는 그대로 유지.
- ${tone}을 유지하되, 의미가 우선.
- 각 줄 독립적으로 번역 (다른 줄과 합치지 마세요).

**💥 강조 마커:**
- 전체 번역 중 **가장 임팩트 있는 문장 20~30%** 에는 앞에 [HL] 마커를 붙이세요.
- 감정이 크거나, 핵심 포인트, 반전/놀라움이 있는 문장
- 매 5~10 문장 중 1~2개 정도

**출력 형식:**
각 줄을 "[N] 번역문" 또는 "[N] [HL] 번역문" 형태로.

**좋은 예시 (한국어 출력):**
입력: [1] (2.5초 / 목표 19자) You're really pushing my buttons now Jimmy
출력: [1] [HL] 제미, 지금 내 신경 건드리지 마

입력: [2] (3.0초 / 목표 22자) Room one thousand two please
출력: [2] 1002호로 가주세요

입력: [3] (2.0초 / 목표 14자) Wait this is insane
출력: [3] [HL] 잠깐 이거 미쳤어

**번역할 줄:**
${numbered}`;

    } else if (targetLang === 'en') {
      // === 영어 출력 ===
      prompt = `You are a professional video subtitle translator specializing in NATURAL English localization.

⚠️⚠️⚠️ ABSOLUTE RULE: YOUR ENTIRE OUTPUT MUST BE IN NATURAL ENGLISH ONLY ⚠️⚠️⚠️
- DO NOT output Korean, Japanese, Chinese, or any other language.
- DO NOT use romanized Korean (e.g., "Oppa", "Unni", "Ajumma", "Ahjussi").
- Translate Korean cultural terms into natural English equivalents.
- If you output any non-English text or romanization, you have failed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 LOCALIZATION RULES (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Korean honorifics → Natural English:**
- 오빠 (boyfriend/older brother) → "babe" / "honey" / "you" / name
  ✅ "Oppa, please open the door" → "Babe, please open the door"
  ✅ "오빠 왜 그래" → "Why are you doing this?" or "Honey, what's wrong?"
- 언니/누나 → "girl" / name / "you" / "sis"
- 아저씨 → "sir" / "mister" / "hey"
- 아줌마 → "ma'am" / "lady"
- 형/오빠 (literal brother) → "bro" / "brother"
- 선배 → name / "you" / "boss"
- 사장님 → "boss" / "sir"
- 선생님 → "teacher" / "doctor" / "ma'am" / "sir"

**Korean fillers/expressions → Natural English:**
- 아이고 → "Oh my god" / "Geez" / "Oh no"
- 어머 → "Oh!" / "Wow"
- 진짜? → "Really?" / "Seriously?"
- 대박 → "Awesome" / "No way" / "Insane"
- 헐 → "Whoa" / "What" / "OMG"
- 와 → "Wow"
- ~잖아 → context-dependent (often "you know")
- ~네 → context-dependent (often skip or use "huh")

**Make it sound like an actual American/English speaker would say it.**
Not a translation. A localization. Like watching a dubbed movie.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 LENGTH RULE (CRITICAL FOR SUBTITLES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ THESE ARE SUBTITLES - viewers must read them in real time!
⚠️ Match the SPOKEN duration of the original.

**Compression rules:**
- Try to stay within 1.4x the target chars (not 2x).
- Cut every unnecessary word.
- Use contractions: "don't", "I'm", "you're", "we'll", "can't", "didn't"
- Drop articles when natural: "Going home" not "I am going to the home"
- Drop "really", "just", "very", "actually" unless emotional impact needs them
- Drop politeness fillers: "could you please" → "can you"

**Examples (Korean → SHORT English):**
- "오빠, 한번만 오빠 문 좀 열어줘" (15 chars, 3s)
  ❌ "Babe, please just open the door this once" (43 chars - TOO LONG)
  ✅ "Babe, open the door please" (26 chars)
  ✅ "Just open the door, please" (26 chars)

- "오빠, 왜 연락이 안 돼? 너무 걱정했잖아" (20 chars, 3s)
  ❌ "Why haven't you contacted me? I was really worried!" (52 chars - TOO LONG)
  ✅ "Why didn't you call? I was worried" (34 chars)

- "아, 진짜 미치겠네" (10 chars, 1.5s)
  ❌ "Oh my god, this is driving me crazy!" (37 chars - TOO LONG)
  ✅ "This is driving me crazy" (24 chars)
  ✅ "I'm losing my mind" (18 chars)

**Rule of thumb:** If your translation is longer than 1.5x the target chars, REWRITE IT SHORTER.
Subtitles that viewers can't finish reading are USELESS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 TRANSLATION PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Convey meaning accurately, but in natural conversational English.
2. Complete sentences. Never cut off mid-sentence.
3. Match the emotional tone (angry, sad, funny, etc.).
4. Keep proper nouns (names, places) as-is.
5. Translate each line independently.
6. ${tone}, but natural English flow comes first.

**💥 Highlight Markers:**
Mark the most impactful 20-30% of sentences with [HL] prefix.

**Output Format:**
Each line as "[N] translated text" or "[N] [HL] translated text"
ALL OUTPUT MUST BE IN NATURAL ENGLISH (no romanized Korean).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 GOOD vs BAD examples
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ BAD (literal translation with romanization):
"[1] Oppa, please just open the door once"
"[2] Oppa, why haven't you contacted me?"
"[3] Oppa, have you already forgotten me?"

✅ GOOD (natural localization):
"[1] [HL] Honey, please just open the door"
"[2] Why haven't you called me back?"
"[3] Did you really forget about me already?"

❌ BAD: "Aren't you Cheon Yi-ho?" "I'm Cheon Sa-bok"
✅ GOOD: "Aren't you Mr. Cheon Yi-ho?" "I'm Cheon Sa-bok" (keep names as-is, but add titles)

❌ BAD: "Aigo, this is really driving me crazy"
✅ GOOD: "Oh my god, this is driving me crazy"

❌ BAD: "Daebak!"
✅ GOOD: "No way!" or "That's insane!"

**Lines to translate (output ONLY natural English, no romanization):**
${numbered}

REMEMBER:
- English only. No Korean characters. No romanized Korean (Oppa, etc.).
- Make it sound like a native English speaker, not a translation.
- Match emotion and pacing.`;

    } else {
      // === 기타 언어 (일본어/중국어/스페인어 등) ===
      prompt = `You are a professional video subtitle translator.

⚠️⚠️⚠️ ABSOLUTE RULE: YOUR ENTIRE OUTPUT MUST BE IN ${targetLangName.toUpperCase()} ONLY ⚠️⚠️⚠️
- DO NOT mix in Korean, English, or any other language.
- Every word, every character must be in ${targetLangName}.
- Even if input is Korean or English, translate fully to ${targetLangName}.
- If you output any non-${targetLangName} text, you have failed.

Translate from ${sourceLangName} to ${targetLangName} accurately.

**Translation Principles:**
1. Convey the original meaning accurately. No paraphrasing.
2. Complete sentences. Never cut off mid-sentence.
3. Natural and concise in ${targetLangName}.
4. Only translate what's in the original.
5. Keep proper nouns as-is.
6. Translate each line independently.

**💥 Highlight Markers:**
Mark the most impactful 20-30% of sentences with [HL] prefix.

**Output Format:**
Each line as "[N] translated text" or "[N] [HL] translated text"
ALL output text must be in ${targetLangName}. NO Korean. NO English (unless target is English).

**Lines to translate (output ONLY ${targetLangName}):**
${numbered}

REMEMBER: Output ${targetLangName} only. No mixing languages.`;
    }

    const content = await callLLM(
      [{ role: 'user', content: prompt }],
      config
    );

    const parsed = {};
    const highlights = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*\[(\d+)\]\s*(.+)$/);
      if (m) {
        const idx = parseInt(m[1]);
        let text = m[2].trim();
        // [HL] 마커 감지
        const hlMatch = text.match(/^\[HL\]\s*(.+)$/i);
        if (hlMatch) {
          text = hlMatch[1].trim();
          highlights[idx] = true;
        }
        parsed[idx] = text;
      }
    }

    batch.forEach((seg, idx) => {
      const text = parsed[idx + 1] || seg.text;
      const isHighlight = highlights[idx + 1] === true;
      results.push({
        start: seg.start,
        end: seg.end,
        text,
        highlight: isHighlight,
      });
    });

    if (i + BATCH_SIZE < segments.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  return results;
}

// ===== 🎬 예능/리액션 모드: 재미있는 구간 자동 추출 =====
// LLM이 Whisper 세그먼트를 보고 가장 재미있는/임팩트 있는 구간을 선택
// 반환: [{start, end, text, reason}] 형식의 하이라이트 배열
async function extractReactionHighlights(segments, videoDurationSec, visionDesc, targetLen, config, onProgress) {
  onProgress('translate', 44, '🎯 LLM이 핵심 장면 선별 중...');

  // 세그먼트가 너무 많으면 압축 (토큰 절약)
  const segText = segments.map((s, i) =>
    `[${i}] ${s.start.toFixed(1)}-${s.end.toFixed(1)}s: ${s.text.trim()}`
  ).join('\n');

  const prompt = `당신은 쇼츠 편집 전문가입니다. 긴 영상에서 가장 재미있고 임팩트 있는 구간만 골라야 합니다.

**원본 영상 길이:** ${videoDurationSec.toFixed(1)}초
**목표 추출 길이:** ${targetLen}초 이내 (총합)
${visionDesc ? `**영상 화면 설명:** ${visionDesc}\n` : ''}
**전체 자막 (시간 표시 포함):**
${segText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 추출 원칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **재미/긴장 포인트** 우선:
   - 강한 리액션 (놀람, 웃음, 분노, 충격)
   - 반전이나 결정적 순간
   - 핵심 정보가 드러나는 부분
   - 호기심을 자극하는 발언

2. **버려야 할 부분**:
   - 인사/도입부 ("안녕하세요", "오늘은...")
   - 광고/협찬 멘트
   - 반복되는 설명
   - 침묵/공백
   - 마무리 ("구독 좋아요")

3. **구간 선택 규칙**:
   - 2~5개 구간 선택 권장 (1개는 단조로움)
   - 각 구간은 5~20초
   - 시간순으로 자연스러운 흐름 (다 뒤죽박죽 X)
   - 첫 구간은 강한 훅이어야 함

4. **🔥 keep_original 결정 (하이브리드 음성용)**:
   각 구간마다 원본 음성을 살릴지 결정하세요.
   - **keep_original: true** → 원본 음성 유지 (출연자 비명/웃음/충격 반응 등 그대로 살림)
   - **keep_original: false** → 한국어 더빙으로 대체 (일반 설명/대사)

   true가 적합한 경우:
   - 출연자가 비명/소리지름 ("えええ!?", "OMG!", "와아!")
   - 빵 터지는 웃음소리
   - 충격받은 짧은 외침
   - 의성어/의태어가 강한 부분

   false가 적합한 경우:
   - 길게 설명하는 부분
   - 외국어라 한국 시청자가 못 알아듣는 대사
   - 정보 전달 위주

   균형: 전체 구간의 30~50%만 true로 (너무 많으면 더빙 무의미)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 출력 형식 (JSON만, 설명 금지)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "highlights": [
    {"start": 시작초, "end": 끝초, "keep_original": true/false, "reason": "선택 이유 한 줄"},
    {"start": 시작초, "end": 끝초, "keep_original": true/false, "reason": "선택 이유 한 줄"}
  ]
}

JSON만 출력. 마크다운 백틱 금지.`;

  const content = await callLLM(
    [{ role: 'user', content: prompt }],
    config
  );

  // JSON 파싱 (마크다운 제거 후)
  const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let parsed;
  try {
    const m = jsonStr.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : jsonStr);
  } catch (e) {
    console.error('[reaction] JSON 파싱 실패:', e.message, jsonStr.substring(0, 200));
    // fallback: 영상의 중반 30%~70% 구간을 사용
    return [{
      start: videoDurationSec * 0.3,
      end: Math.min(videoDurationSec * 0.7, videoDurationSec * 0.3 + targetLen),
      text: segments.map(s => s.text).join(' '),
      reason: 'fallback (LLM 실패)',
    }];
  }

  if (!parsed.highlights || !Array.isArray(parsed.highlights) || parsed.highlights.length === 0) {
    throw new Error('LLM이 하이라이트를 추출하지 못했습니다.');
  }

  // 각 하이라이트에 해당 구간의 텍스트 매핑 + keepOriginal 플래그
  const result = parsed.highlights
    .map(h => {
      const start = parseFloat(h.start);
      const end = parseFloat(h.end);
      if (isNaN(start) || isNaN(end) || start >= end) return null;
      // 해당 시간대의 세그먼트 텍스트 합치기
      const text = segments
        .filter(s => s.end > start && s.start < end)
        .map(s => s.text.trim())
        .join(' ');
      return {
        start: Math.max(0, start),
        end: Math.min(videoDurationSec, end),
        text,
        reason: h.reason || '',
        keepOriginal: h.keep_original === true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);  // 시간순

  const totalDur = result.reduce((s, h) => s + (h.end - h.start), 0);
  const origCount = result.filter(h => h.keepOriginal).length;
  console.log(`[reaction] 하이라이트 ${result.length}개 추출 (총 ${totalDur.toFixed(1)}초, 원본음성 유지 ${origCount}개)`);
  result.forEach((h, i) => {
    const audioMark = h.keepOriginal ? '🎤원본' : '🤖더빙';
    console.log(`  ${i+1}. ${audioMark} ${h.start.toFixed(1)}~${h.end.toFixed(1)}s: ${h.reason}`);
  });

  return result;
}

// ===== 🎬 예능/리액션 모드: 하이라이트 구간만 추출해서 새 영상 만들기 =====
// ffmpeg concat 필터로 여러 구간 이어붙임
async function buildReactionClip(originalPath, highlights, jobDir, onProgress) {
  onProgress('translate', 52, '✂️ 영상 구간 잘라내는 중...');

  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const outputPath = path.join(jobDir, 'reaction_clip.mp4');

  // 각 구간을 개별 파일로 자른 후 concat (안정적)
  const partFiles = [];
  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    const partPath = path.join(jobDir, `react_part_${i}.mp4`);
    try {
      await runCommand(ffmpeg, [
        '-y',
        '-ss', h.start.toFixed(3),
        '-i', originalPath,
        '-t', (h.end - h.start).toFixed(3),
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        partPath,
      ]);
      partFiles.push(partPath);
    } catch (e) {
      console.warn(`[reaction] 구간 ${i+1} 추출 실패:`, e.message);
    }
  }

  if (partFiles.length === 0) {
    throw new Error('하이라이트 구간 추출에 모두 실패했습니다.');
  }

  // concat 리스트 파일 생성
  const concatListPath = path.join(jobDir, 'reaction_concat.txt');
  const concatList = partFiles.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(concatListPath, concatList, 'utf-8');

  // concat
  try {
    await runCommand(ffmpeg, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      outputPath,
    ]);
  } catch (e) {
    // copy 실패 시 재인코딩
    console.warn('[reaction] concat copy 실패, 재인코딩 시도:', e.message);
    await runCommand(ffmpeg, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      outputPath,
    ]);
  } finally {
    // 정리
    try { fs.unlinkSync(concatListPath); } catch (e) {}
    partFiles.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
  }

  return outputPath;
}

// ===== 🎬 예능 썰 모드: 썰 스타일 스크립트 생성 (v2 - 강화) =====
// 사용자 가이드 기반: 훅 → 전개 → 반전 → 여운
// 영상 길이 정확하게 맞춤 (TTS가 영상 끝에서 끊기지 않게)
async function generateReactionScript(originalText, videoDurationSec, visionDesc, targetLang, config, onProgress) {
  onProgress('translate', 58, '✍️ 썰 스타일 재구성 중...');

  const targetLangName = LANGUAGES[targetLang]?.name || '한국어';
  const cps = getCharsPerSecond(targetLang);
  // 🔴 영상 길이 정확하게 맞춤 (TTS rate +15% 감안)
  const targetChars = Math.floor(videoDurationSec * cps * 1.0);
  const minChars = Math.floor(videoDurationSec * cps * 0.85);
  const maxChars = Math.floor(videoDurationSec * cps * 1.15);

  let prompt;

  if (targetLang === 'ko') {
    prompt = `너는 쇼츠 영상 편집 전문가다.
영상 속 특정 장면을 "몰입형 쇼츠"로 재구성한다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 입력 데이터
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**영상 길이:** ${videoDurationSec.toFixed(1)}초
${visionDesc ? `\n**영상 화면 설명:**\n${visionDesc}\n` : ''}
**원본 자막 (참고용):**
${originalText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 길이 강제 (가장 중요!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- 🔴 **목표 글자수: ${minChars}~${targetChars}자** (정확히 이 범위)
- 🔴 **최대 ${maxChars}자 절대 초과 금지!** 초과하면 TTS가 영상보다 길어져 끊깁니다.
- 🔴 영상 ${videoDurationSec.toFixed(1)}초에 정확히 맞는 분량
- 🔴 짧으면 영상 무음, 길면 잘림 → 둘 다 안 됨

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 절대 하지 말 것
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- ❌ 요약하지 마라 ("이 영상은...에 대한 내용입니다" X)
- ❌ 설명하지 마라 ("출연자가 ~을 했습니다" X)
- ❌ 명언처럼 만들지 마라 ("우리는 모두..." X)
- ❌ 결론만 쓰지 마라
- ❌ 존댓말 X (반말로)
- ❌ 단순 설명 금지

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 반드시 할 것
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- ✅ 과정 중심으로 구성 (그래서 어떻게 됐냐면)
- ✅ 감정 흐름 살릴 것 (어이가 없어서 / 갑자기 빵 터짐)
- ✅ 짧고 몰입감 있게 만들 것
- ✅ 친구한테 썰 푸는 톤
- ✅ 자극적이고 몰입감 있게

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 작업 구조
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. 강한 훅 (0~2초)** - 시청자가 손가락 멈출 정도
   ✅ 좋은 예:
   - "이거 진짜 실화임"
   - "보다가 빵 터진 거 보여줌"
   - "ㅈㄴ 어이없는 일 있었음"
   - "이 영상 보고 충격 먹음"
   - "00에서 이런 일이 있다고?"
   ❌ 나쁜 예: "안녕하세요", "오늘은~", "여러분"

**2. 상황 → 전개** - 몰입감 있게 진행
   - "그래서 뭐냐면..."
   - "근데 갑자기..."
   - "아 그러다가..."
   - 긴장감 빌드업

**3. 반응/반전** - 핵심 임팩트
   - "근데 진짜 충격적인 게..."
   - "결국에는..."
   - "마지막에 이게 나옴"

**4. 여운** - 다음 시청 유도
   - "이거 진짜 봐야 함"
   - "댓글로 의견 달아줘"
   - "다음편 더 미친 거 있음"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎤 더빙 스크립트 가이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ **짧게 끊기** (한 문장 7~15자, 한 호흡 단위)
✅ **실제 말하듯 자연스럽게** (반말 + 약간의 신조어 OK)
✅ **감정 표현 풍부하게** ("와", "헐", "미친", "ㅋㅋ", "진짜")
✅ **의성어/의태어 활용** ("빵 터짐", "쾅", "두근")
✅ **자극적인 단어** ("충격", "미친", "어이없는", "대박")

❌ 딱딱한 설명문
❌ 존댓말
❌ 긴 문장 (한 호흡에 안 끊기는 길이)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 자막 가이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- 한 줄 = 한 호흡 = 한 자막
- 짧게 끊어서 (10자 내외 권장)
- 핵심 단어 강조

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 출력 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 문장 줄바꿈으로 구분. 라벨/번호/마크다운/이모지 금지.
출력은 더빙 스크립트만 (제목, 포인트 표시 금지).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 좋은 출력 예시 (참고)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이거 보고 빵 터졌음
일본 예능에서 진짜 가짜 초콜릿 맞추기 했는데
신발이 사실 초콜릿이었음
출연자도 처음엔 의심 안 했는데
한입 베어물자마자 표정 바뀜
이게 초콜릿이라고 충격받음
근데 더 충격적인 게
양복도 가방도 다 초콜릿이었음
일본 장인 진짜 미쳤음
풀버전 댓글에 있음

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

위 예시처럼 ${minChars}~${targetChars}자로, 짧은 호흡 단위로 썰 풀듯이 작성:`;

  } else {
    // 영어 (간단 버전)
    prompt = `You are a YouTube Shorts editor.
Reframe this scene as an immersive shorts video.

⚠️ This is a SHORTS DUBBING SCRIPT, not a summary.

**Video length:** ${videoDurationSec.toFixed(1)}s
**Target chars:** ${minChars}~${targetChars} (MAX ${maxChars}, never exceed!)

${visionDesc ? `**Visual:** ${visionDesc}\n` : ''}
**Original transcript:**
${originalText}

DO NOT:
- Summarize or explain
- Use formal tone
- Write conclusions
- Make it sound like a quote

DO:
- Process-focused storytelling
- Show emotion flow
- Short punchy sentences (10 words max each)
- Casual friend-telling-a-story tone

Structure (4 parts):
1. Strong hook (0-2s) - Make viewer stop scrolling
2. Situation → development - "So what happened was..."
3. Reaction/twist - "But the crazy part is..."
4. Linger - "Watch the full one in comments"

Output in ${targetLangName}, one sentence per line.
Exactly ${minChars}-${targetChars} characters total. NEVER exceed ${maxChars}.`;
  }

  const content = await callLLM(
    [{ role: 'user', content: prompt }],
    config
  );

  // 정리: 빈 줄 제거, 라벨 제거
  let lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)
    .map(l => l.replace(/^[-•*\d\.]+\s*/, ''))
    .map(l => l.replace(/^\[.*?\]\s*/, ''))
    .map(l => l.replace(/^\**(훅|오프닝|전개|반전|여운|끝|Hook|Build-up|Twist|Linger|제목|포인트|자막|스토리)\**:?\s*/i, ''))
    .filter(l => l && !l.startsWith('**') && !l.startsWith('##') && !l.startsWith('━'));

  let result = lines.join('\n');

  // 🔴 안전장치: 결과가 maxChars 초과면 뒷줄부터 제거
  if (result.length > maxChars) {
    console.warn(`[reaction] 스크립트 길이 초과 (${result.length}자 > 한계 ${maxChars}자). 뒷부분 잘라냄.`);
    const truncated = [];
    let charCount = 0;
    for (const line of lines) {
      if (charCount + line.length > maxChars) break;
      truncated.push(line);
      charCount += line.length;
    }
    result = truncated.join('\n');
    console.log(`[reaction] 잘라낸 결과: ${result.length}자, ${truncated.length}줄`);
  }

  return result;
}


async function generateAdCopy(originalText, videoDurationSec, targetLang, config, onProgress) {
  onProgress('translate', 50, '광고 카피 재작성 중...');

  const targetLangName = LANGUAGES[targetLang]?.name || '한국어';
  const cps = getCharsPerSecond(targetLang);
  // 🔴 TTS rate +15% 감안해서 실제 읽기 속도 계산
  // 기본 cps=7인데 +15% 빠르게 읽으면 → 실제 초당 8글자 읽음
  const actualCps = cps * 1.15;
  
  // 🔴 마지막 멘트 길이 미리 계산 (있으면)
  const outroText = (config.outroText || '').trim();
  const outroChars = outroText.length;
  
  // 영상 길이에서 마지막 멘트 읽는 시간 빼고 계산
  const outroSeconds = outroChars > 0 ? outroChars / actualCps : 0;
  const availableSeconds = videoDurationSec - outroSeconds - 0.5; // 0.5초 여유
  
  // 카피 길이 계산 (마지막 멘트 제외한 부분)
  const targetChars = Math.floor(availableSeconds * actualCps * 0.95);
  const minChars = Math.floor(availableSeconds * actualCps * 0.85);
  const maxChars = Math.floor(availableSeconds * actualCps * 1.0); // 딱 맞게
  
  console.log(`[adCopy] 영상 ${videoDurationSec}초, 마지막멘트 ${outroChars}자(${outroSeconds.toFixed(1)}초), 카피 목표 ${targetChars}자 (${minChars}~${maxChars})`);

  // 말투 설정 (반말/존댓말)
  const speechStyle = config.speechStyle || 'casual';
  const speechStyleInstruction = speechStyle === 'formal'
    ? '✅ **존댓말 사용**: "~입니다", "~해요", "~드려요" 등 공손한 어투로 작성'
    : '✅ **반말 사용**: 친구한테 추천하는 듯한 편한 말투로 작성';

  // 사용자 지정 후킹 멘트 (hookText 또는 productHookText)
  const userHook = (config.hookText || config.productHookText || '').trim();
  const hookInstruction = userHook 
    ? `🔴 **첫 문장은 반드시 다음 후킹 멘트로 시작**: "${userHook}"\n   (이 멘트를 그대로 사용하고, 이어서 카피 작성)`
    : `🔴 **첫 문장 후킹은 매번 새롭고 다양하게!** 아래 예시 중 하나를 참고하되, 비슷하게만 쓰지 말고 창의적으로:
   - "이거 본 순간 손가락이 멈췄음"
   - "주방용품 쇼핑 끝낸 사람만 봐"
   - "남편이 이거 보고 결제 누름"
   - "여름 다가오는데 ㅇㅇ 못 한 사람 손!"
   - "진짜 이런 거 있는 줄 몰랐음"
   - "와 이건 진짜 미친 가성비"
   - "혼자 알기 아까워서 공유함"
   - "장바구니 1년 묵혀두다 드디어 샀는데"
   🔴 예시와 똑같이 쓰면 안 됨! 매번 새로운 표현으로!`;

  // 한국어일 때와 그 외 언어일 때 프롬프트 분기
  let prompt;

  if (targetLang === 'ko') {
    // === 한국어 광고 카피 (자막형) ===
    prompt = `당신은 한국 쇼츠 광고 카피라이팅 최고 전문가입니다.
틱톡 / 인스타 / 유튜브 쇼츠에서
폭발적으로 반응 나오는 광고 대본을 작성하세요.

**영상 정보:**
- 영상 길이: ${videoDurationSec.toFixed(1)}초
- 🔴 **목표 카피 길이: ${minChars}~${targetChars}자**
- 🔴 **최대 ${maxChars}자 절대 초과 금지!**

**원본 스크립트 (참고만):**
${originalText}

────────────────────
[출력 방식 - 핵심 변경]
────────────────────
- 문장이 아니라 "자막 + 더빙용 대본"으로 작성
- 한 줄씩 끊어서 출력
- 각 줄 = 음성 한 번에 읽는 단위
👉 페이지 / 문단 / 설명 금지
👉 줄바꿈만 사용

────────────────────
[자막 / 더빙 규칙 - 핵심]
────────────────────
- 한 줄은 짧고 빠르게 읽히게 작성
- 한 줄 = 1~2초 분량
👉 읽고 멈출 수 있어야 함

────────────────────
[문법 규칙]
────────────────────
- 자연스럽게 말이 되게 작성
- 주어 + 동사 분리 금지
- 🔴 한 줄은 반드시 완전한 문장으로! 단어나 짧은 구절 금지!

────────────────────
[길이 제한]
────────────────────
- 🔴 한 줄 최소 20자 ~ 최대 40자
- 너무 짧으면 TTS가 뚝뚝 끊김! 완전한 문장으로!
- 적당히 끊되, 문장이 완결되게

────────────────────
[분할 예시]
────────────────────
❌ 너무 짧음 (단어 수준)
이거
써봤는데
진짜
편함

❌ 이것도 너무 짧음
이거 써봤는데
진짜 편하고
깔끔함

⭕ 적당함 (완전한 문장)
이거 써봤는데 진짜 편하고 깔끔해!
디자인도 예쁘고 가성비 미쳤음~

────────────────────
📐 5단계 구조 (흐름 유지하되 자막형으로 분할)
────────────────────
1. 후킹 (초반 2~3줄 강하게)
   ${hookInstruction}

2. 공감 문제

3. 해결 + 디테일

4. 추가 어필

5. CTA
👉 구조는 유지하되 "줄 단위"로 풀 것

────────────────────
🎭 톤
────────────────────
${speechStyleInstruction}
- 위트 + 약간 과장
- 마침표 금지
- 느낌표 / 물음표 사용 가능

────────────────────
🔢 숫자 규칙
────────────────────
- 2.4m → 이점사 미터
- 24kg → 이십사 킬로

────────────────────
🚫 금지
────────────────────
- 설명형 문장
- 긴 문장
- 한 줄에 정보 2개 이상
- 광고 티 나는 문장
- 마침표(.)
- 이모지

────────────────────
[출력 형식]
────────────────────
- 코드블록 없이
- 줄바꿈만 있는 대본 출력
- 추가 설명 금지
- 최소 ${minChars}자 이상 필수!`;

  } else if (targetLang === 'en') {
    // === 영어 광고 카피 ===
    prompt = `You are a top TikTok/Instagram/YouTube Shorts ad copywriter.
Create a viral English short-form ad copy that sounds like it was written by a native English speaker from scratch.
DO NOT translate literally - completely recreate the message in natural English Shorts style.

**Video Info:**
- Video length: ${videoDurationSec.toFixed(1)} seconds
- 🔴 **Target length: ${minChars}~${targetChars} characters** (must be within this range)
- 🔴 NEVER write less than ${minChars} chars. The video must not have silence.

**Original Script (reference only, NO literal translation):**
${originalText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 5-Part Structure (MUST follow)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. Hook (3 sec)** - First 1-2 sentences must grab attention
   ✅ Good:
   - "Wait until you see this"
   - "POV: you just found the best kitchen hack"
   - "I'm literally obsessed with this"
   - "Nobody's talking about this but..."
   - "This changed my morning routine forever"
   ❌ Bad: "Let me introduce...", "Today I'll show you..."

**2. Relatable Problem (5 sec)** - Real pain point people face
   ✅ Specific situations:
   - "You know that moment when..."
   - "I used to waste hours trying to..."
   - "Every single time I..."

**3. Solution + Details (15 sec)** - How the product solves it + specs
   ✅:
   - "But then I found this..."
   - "You literally just..."
   - "And the best part?"

**4. Extra Appeal (5 sec)** - A twist or punch line
   ✅:
   - "It's basically a game changer"
   - "I can't believe it's only..."
   - "Honestly worth every penny"

**5. CTA (2-3 sec)** - Natural call to action
   ✅:
   - "Link in bio for details"
   - "Check my profile for the link"
   - "All info in my bio"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 Tone & Style
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Casual, friend-recommending tone
✅ Witty + slightly exaggerated
✅ Natural interjections: "honestly", "literally", "no joke", "trust me"
✅ Short, punchy sentences
✅ NOT salesy - sound like an authentic recommendation

❌ Stiff formal language / Corporate speak / Fake hype / Emojis

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔢 Numbers/Units (for TTS to read correctly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ❌ "2.4m x 1.5m" → ✅ "two point four meters by one point five meters"
- ❌ "24kg" → ✅ "twenty four kilograms"
- ❌ "100%" → ✅ "one hundred percent"
- Write out numbers and units as words

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Output Format
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Output the copy only. Separate each sentence with a newline.
NO labels, NO numbering, NO markdown, NO explanations.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Good Example (25 sec, ~200 chars)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Original: "This 2.4m x 1.5m foldable pool is much better than plastic alternatives."

Output:
POV: summer's coming and you don't want to spend hundreds on a pool
I literally found the solution
This foldable pool is two point four meters by one point five meters
You know how you buy those cheap plastic pools and they break after one use?
Yeah, this one literally just folds up and fits in a box
End of summer, just pack it away until next year
I'm telling you, this is a game changer
Link in bio for details

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now write the copy following all the rules above.
**Minimum ${minChars} characters**, 5-part structure, casual witty tone:`;

  } else {
    // === 기타 언어 (일본어/중국어/스페인어 등) ===
    prompt = `You are a top short-form video ad copywriter for ${targetLangName}.
Create a viral ${targetLangName} Shorts ad copy that sounds native and natural.
DO NOT translate literally - completely recreate the message in the target language's natural Shorts style.

**CRITICAL: Your output MUST be in ${targetLangName}. Do NOT use any other language.**

**Video Info:**
- Video length: ${videoDurationSec.toFixed(1)} seconds
- Target output length: ${minChars}~${targetChars} characters

**Original Script (reference only, NO literal translation):**
${originalText}

**5-Part Structure:**
1. Hook (3s): Attention-grabbing first sentence
2. Relatable Problem (5s): Pain point people face
3. Solution + Details (15s): How the product solves it with specifics
4. Extra Appeal (5s): Wit or punch line
5. CTA (2-3s): Natural call to action ("profile link", "bio", etc.)

**Tone:**
- Casual, friend-recommending style (native to ${targetLangName})
- Witty, natural interjections
- NOT salesy

**Numbers/Units:** Write out as words (not digits) so TTS reads correctly.

**Output Format:**
- Output in ${targetLangName} ONLY
- One sentence per line
- No labels, no markdown, no explanations

Write the ${targetLangName} ad copy now (minimum ${minChars} characters):`;
  }

  const content = await callLLM(
    [{ role: 'user', content: prompt }],
    config
  );

  // 응답 정리: 빈 줄 제거, 라벨 제거
  let lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)
    .map(l => l.replace(/^[-•*\d\.]+\s*/, '')) // 불릿/번호 제거
    .map(l => l.replace(/^\**(훅|문제|해결|결과|Hook|Problem|Solution|Result|CTA|Appeal)\**:?\s*/i, '')) // 라벨 제거 (한/영)
    .filter(l => l && !l.startsWith('**') && !l.startsWith('##'));

  // 🔴 금지어 필터링 (config.bannedWords에 있는 문구가 포함된 줄 제거)
  if (config.bannedWords && config.bannedWords.length > 0) {
    const bannedWords = config.bannedWords.map(w => w.toLowerCase());
    const beforeCount = lines.length;
    lines = lines.filter(line => {
      const lower = line.toLowerCase();
      return !bannedWords.some(banned => lower.includes(banned));
    });
    const removed = beforeCount - lines.length;
    if (removed > 0) {
      console.log(`[adCopy] 금지어로 ${removed}줄 제거됨`);
    }
  }

  return lines.join('\n');
}

// ===== 제품 모드: 자막용 키워드 추출 =====
// 광고 카피에서 "화면에 크게 띄울 임팩트 키워드"만 추출
// 카피는 TTS로 읽고, 자막은 키워드만
async function extractHighlightKeywords(adCopy, config) {
  const prompt = `다음 쇼츠 광고 카피에서 "화면에 크게 띄울 임팩트 자막"을 추출하세요.

**규칙:**
1. 🔴 TTS는 전체 카피를 읽지만, 자막은 **짧은 키워드/구절**만 표시합니다.
2. 카피의 각 문장마다 **핵심 포인트 1개**씩 뽑아냄
3. 각 자막은 **2-6자**로 아주 짧게
4. 이모지 1-2개까지 활용 가능 (🔥💯✨👀💥 등)
5. 원본 카피 순서 유지

**출력 형식:**
각 자막을 한 줄씩. 다른 설명 없이 키워드만.

**좋은 예시:**
입력 카피:
이 접이식 풀 미쳤어
매번 플라스틱 풀 보관 힘들었지?
이건 접어서 쏙 들어가
여름마다 꺼내 쓰기 딱

출력:
🔥 미친 풀
보관 고민?
접어서 쏙
여름 필수템

**이제 아래 카피의 자막을 추출하세요:**

${adCopy}`;

  const content = await callLLM(
    [{ role: 'user', content: prompt }],
    config
  );

  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)
    .map(l => l.replace(/^[-•*\d\.]+\s*/, ''))
    .filter(l => l.length > 0 && l.length < 30);
}

// ===== 썰 쇼츠 모드: 스토리 재구성 =====
// 영상 → 몰입형 썰 스토리로 재구성 + 더빙 스크립트 생성
// ===== 썰 쇼츠 모드: 드라마/영상 각본 재구성 =====
// 원본 영상의 대본/장면을 유지하면서 한국 드라마 나레이션 톤으로 각색
async function generateStoryScript(originalText, videoDurationSec, visionDescription, targetLang, config, onProgress, transcriptionSegments = null) {
  onProgress('translate', 50, '드라마 각본 재구성 중...');

  const targetLangName = LANGUAGES[targetLang]?.name || '한국어';
  const cps = getCharsPerSecond(targetLang);
  const targetChars = Math.floor(videoDurationSec * cps * 1.2);
  const minChars = Math.floor(videoDurationSec * cps * 0.95);

  // 원본 대본을 시간 순서대로 정리 (타임스탬프 포함)
  let timelineText = '';
  if (transcriptionSegments && transcriptionSegments.length > 0) {
    timelineText = transcriptionSegments
      .map((s, i) => `[${s.start.toFixed(1)}s~${s.end.toFixed(1)}s] ${s.text.trim()}`)
      .join('\n');
  } else {
    timelineText = originalText;
  }

  let prompt;

  if (targetLang === 'ko') {
    // === 한국어 드라마 각본 ===
    prompt = `너는 한국 TikTok/인스타 드라마 각색 쇼츠 제작 최고 전문가다.
목표: 외국 영상(드라마/영화/현실 상황)을 **원본 뼈대를 유지하면서** 한국 감성의 드라마 나레이션 쇼츠로 재구성한다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 입력 데이터
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**원본 대본 (시간순, 반드시 순서 지킬 것):**
${timelineText}

${visionDescription ? `**영상 화면 분석 (무슨 상황인지 파악):**
${visionDescription}
` : ''}

**영상 길이:** ${videoDurationSec.toFixed(1)}초
**목표 글자수:** ${minChars}~${targetChars}자

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 각본 작성 원칙 (가장 중요!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. 원본 대본 뼈대 유지** 🔴
- 원본 영상의 **장면 순서를 그대로 따라가세요**
- 원본 대사의 **핵심 의미는 반영**하되
- 드라마 감성으로 각색 (직역 X, 창작 O)
- 예: 원본에서 A가 B에게 고백 → 각색에서도 고백 장면으로
- 원본 등장인물 관계/갈등 구조 존중

**2. 드라마 나레이션 톤** 🎭
- 반말 / 인터넷 어투 금지 ("ㅋㅋ", "ㅁㅊ", "ㄹㅇ" 전부 금지)
- 드라마 나레이션 어투 사용:
  - "~였다", "~더라", "~하고 있었다"
  - "그 순간", "그러나", "알고 보니"
  - "결국", "마침내", "운명처럼"
- 감정을 드라마틱하게 표현
- 긴장감 있게 끊어서

**3. 한국 드라마 감성 단어 적극 활용**
- 재벌 / 재벌 3세 / 회장님 / 실장님
- 계약 결혼 / 약혼 / 정략 결혼 / 파혼
- 비밀 / 진실 / 배신 / 복수 / 비밀연애
- 운명 / 인연 / 첫사랑 / 재회 / 이별
- 오해 / 질투 / 고백 / 키스
- 외국 이름은 한국식으로 바꿔도 OK (Mark → 준호, Emma → 지민)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 4단계 구조
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. 오프닝 (0~3초)**: 충격적 상황 제시
  - "재벌 3세였던 그 남자"
  - "그녀의 인생이 완전히 바뀐 날"
  - "모든 게 거짓말이었다"
  - "그 순간, 운명이 뒤틀렸다"

**2. 전개 (중간)**: 관계/갈등 설명
  - 등장인물 소개
  - 갈등 상황 묘사
  - 감정선 빌드업

**3. 반전/클라이맥스 (후반)**: 극적 전환
  - "그런데 알고 보니"
  - "충격적인 진실이 밝혀지는데"
  - "그녀가 감춘 비밀은"

**4. 여운/CTA (끝)**: 다음 편 궁금증
  - "다음 편이 궁금하면 팔로우"
  - "이 드라마 제목은 댓글에"
  - "더 많은 각색은 프로필에"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎙️ 화자 태그 시스템 (가장 중요!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 줄 앞에 반드시 화자 태그를 붙이세요:

**[NARR]** = 나레이터 (중후한 남자 목소리)
**[F1]** = 여자 청년 (여주인공, 20대)
**[F2]** = 여자 성인 (30~40대)
**[F3]** = 여자 노년 (엄마, 할머니, 시어머니 등)
**[M1]** = 남자 청년 (남주인공, 20대)
**[M2]** = 남자 성인 (30~40대)
**[M3]** = 남자 중년 (아버지, 회장 등)

**규칙:**
1. 🔴 **나레이션은 전체의 20~30%만!** 주로 **앞부분(훅)** 과 **중간 한 번** 만.
2. 🔴 **나머지는 대사로 작성** - 각 대사마다 화자 태그
3. 🔴 원본 영상 화면 분석 보고 누가 말하는지 추측 (남자인지 여자인지, 나이대)
4. 🔴 대사는 드라마 나레이션이 아닌 **실제 대사체**로 작성
5. 🔴 화자 일관성 유지 - 같은 인물은 계속 같은 태그

**대사 톤 가이드:**
- [F1] 여주: "정말이야?", "오빠 나 어떡해", "미안해요..."
- [M1] 남주: "널 사랑해", "무슨 일이야?", "나만 믿어"
- [F3] 엄마: "절대 안 된다!", "우리 집안에 들일 수 없어", "내 아들한테 무슨 짓이냐"
- [M3] 아버지: "안 돼, 절대 허락 못 해", "회사가 먼저다"
- [NARR] 나레이션: "그 순간 운명이 뒤틀렸다", "그녀는 알지 못했다"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 출력 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
각 줄 앞에 태그 필수. 한 줄에 한 문장. 설명/번호/마크다운 금지.
이모지 금지 (자막에서 깨짐).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 좋은 예시 (원본 순서 유지 + 화자 태그)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**원본:**
[0s~3s] Woman: "I didn't know you were engaged"
[3s~6s] Man: "My father arranged it years ago"
[6s~10s] Woman: "This changes everything"
[10s~15s] Mother: "You can't marry her!"

**각색 출력:**
[NARR] 재벌 3세였던 준호
[NARR] 그 앞에 나타난 운명의 여자 지민
[F1] 오빠, 이게 무슨 말이에요
[F1] 약혼자가 있었다고요?
[M1] 미안해 지민아
[M1] 아버지가 정해준 정략결혼이야
[F1] 어떻게 나한테 숨길 수 있어요
[NARR] 그 순간 모든 것이 무너져 내렸다
[F3] 절대 안 돼! 저런 여자를 우리 집안에?
[M1] 어머니, 제발요
[F1] 저 그냥 떠날게요
[M1] 지민아, 가지 마
[NARR] 다음 편이 궁금하면 팔로우

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 절대 금지
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "이거 진짜 실화임 ㅋㅋ"  ← 인터넷 어투
❌ "ㅁㅊ 이게 뭐야"           ← 자음 반복
❌ "와 대박이다"              ← 반응형 감탄사
❌ 태그 없는 줄 출력          ← 반드시 태그 필수!
❌ 모든 줄을 [NARR]로만       ← 대사가 있어야 함
❌ "나레이션: ..."            ← 라벨 형식 X, 태그 형식 O

✅ [NARR] 그의 선택은 잔인했다
✅ [F1] 오빠, 왜 그래요
✅ [M1] 미안해, 다 내 잘못이야

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**핵심 체크리스트:**
1. ✅ 모든 줄에 [NARR/F1/F2/F3/M1/M2/M3] 태그 붙임
2. ✅ 나레이션은 20~30%만 (주로 앞/중간)
3. ✅ 나머지는 대사
4. ✅ 원본 장면 순서 유지
5. ✅ 한국 드라마 감성 단어 활용

**최소 ${minChars}자 이상**, 드라마 각본 형식으로 작성:`;

  } else if (targetLang === 'en') {
    // === 영어 드라마 각본 ===
    prompt = `You are a top TikTok/Instagram drama adaptation expert for English-speaking audiences.
Create an immersive drama narration based on the video content.
**Maintain the original story structure** while adapting it into a gripping drama narration style.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Input Data
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Original Script (follow this timeline order):**
${timelineText}

${visionDescription ? `**Visual Analysis:**
${visionDescription}
` : ''}

**Video length:** ${videoDurationSec.toFixed(1)} seconds
**Target length:** ${minChars}~${targetChars} characters

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 Drama Adaptation Rules
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. Keep the original skeleton** 🔴
- Follow the scene order from the original
- Preserve the core meaning of original dialogue
- But adapt with drama flair (not literal translation)

**2. Drama Narration Tone** 🎭
- Past tense narration style
- "He didn't know", "She had no idea", "That day changed everything"
- Dramatic phrases: "That moment", "Little did they know", "But fate had other plans"
- Short, punchy, cinematic sentences
- NO casual internet speak, NO "lol", NO "omg"

**3. Drama Vocabulary**
- billionaire / CEO / heir / arranged marriage
- secret / betrayal / revenge / scandal
- forbidden love / destiny / first love / reunion
- mistress / affair / contract

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 4-Part Structure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. Opening Hook (0-3s)**:
  - "He was the billionaire heir"
  - "Her life was about to change forever"
  - "That night changed everything"

**2. Build-up (middle)**: Character/conflict setup

**3. Climax/Twist (late)**:
  - "But there was one thing she didn't know"
  - "The shocking truth was about to surface"

**4. Linger (end)**:
  - "Follow for part 2"
  - "Drama title in comments"
  - "Link in bio for more"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎙️ SPEAKER TAG SYSTEM (MOST IMPORTANT!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each line MUST start with a speaker tag:

**[NARR]** = Narrator (deep male voice)
**[F1]** = Young female (female lead, 20s)
**[F2]** = Adult female (30-40s)
**[F3]** = Older female (mother, grandma)
**[M1]** = Young male (male lead, 20s)
**[M2]** = Adult male (30-40s)
**[M3]** = Older male (father, CEO)

**Rules:**
1. 🔴 **Narration is only 20-30%** - mostly at opening (hook) and one in the middle
2. 🔴 **Rest must be dialogue** with speaker tags
3. 🔴 Infer speaker from visual analysis (male/female, age)
4. 🔴 Dialogue uses natural speech, not narration
5. 🔴 Keep speaker consistency - same person = same tag

**Dialogue tone guide:**
- [F1] female lead: "Really?", "I can't believe this", "I'm so sorry..."
- [M1] male lead: "I love you", "What happened?", "Trust me"
- [F3] mother: "Absolutely not!", "You can't marry her!", "I forbid it!"
- [M3] father: "No, never", "Company comes first"
- [NARR] narrator: "Fate had other plans", "She didn't know what was coming"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Output Format
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every line MUST have a tag. One sentence per line. No labels/numbers/markdown.
ENGLISH ONLY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Good Example (original order + speaker tags)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Original:**
[0s~3s] Woman: "I didn't know you were engaged"
[3s~6s] Man: "My father arranged it years ago"
[6s~10s] Mother: "You can't marry her!"

**Adaptation:**
[NARR] He was the billionaire heir
[NARR] She was the girl who stole his heart
[F1] Wait, what do you mean engaged?
[F1] You lied to me this whole time?
[M1] I'm so sorry Emma
[M1] My father arranged it years ago
[F1] How could you keep this from me?
[NARR] In that moment, everything changed
[F3] Absolutely not! Not with that girl!
[M1] Mother, please
[F1] I'll just leave
[M1] Emma, don't go
[NARR] Follow for part two

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ NEVER DO THIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Lines without tags (every line needs a tag!)
❌ "Narrator: ..." (use [NARR] tag, not label)
❌ All [NARR] lines (need dialogue mix)
❌ Casual internet speak (lol, omg)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write the drama script now following original scene order with speaker tags.
**Minimum ${minChars} characters**, dramatic narration + dialogue mix:`;

  } else {
    // === 기타 언어 ===
    prompt = `You are a drama adaptation expert for ${targetLangName} short-form videos.
Create an immersive drama narration in ${targetLangName} based on the video content.

⚠️ Output MUST be in ${targetLangName} ONLY. Not Korean, not English.

**Keep original story structure** while adapting to drama narration style.

**Original Script (timeline order):**
${timelineText}

${visionDescription ? `**Visual:**
${visionDescription}
` : ''}

**Target length:** ${minChars}~${targetChars} characters

**Rules:**
1. Follow original scene order
2. Drama narration tone (not casual, not comedic)
3. Short cinematic sentences
4. Dramatic vocabulary (heir, secret, betrayal, destiny, etc.)
5. Output ONLY in ${targetLangName}

**🎙️ Speaker Tag System (REQUIRED):**
Each line MUST start with one of these tags:
- [NARR] = narrator (deep voice)
- [F1] = young female (20s, lead)
- [F2] = adult female (30-40s)
- [F3] = older female (mother)
- [M1] = young male (20s, lead)
- [M2] = adult male (30-40s)
- [M3] = older male (father)

Rules:
- Narration is only 20-30% (mostly opening + middle)
- Rest must be dialogue with character tags
- Same person = same tag throughout
- Infer speaker from visual analysis

Example output:
[NARR] He was the heir to a fortune
[F1] How could you do this to me?
[M1] Please, let me explain
[F3] Stay away from my son!
[NARR] Their love was forbidden

Write the ${targetLangName} drama script with speaker tags now:`;
  }

  const content = await callLLM(
    [{ role: 'user', content: prompt }],
    config
  );

  // 응답 정리: 빈 줄 제거, 라벨 제거
  // 🔴 주의: 화자 태그 [NARR/F1/F2/F3/M1/M2/M3]은 보존! 다른 라벨만 제거
  const SPEAKER_TAG_RE = /^\[(NARR|F[1-3]|M[1-3])\]/i;
  const lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)
    .map(l => l.replace(/^[-•*\d\.]+\s*/, ''))
    .map(l => l.replace(/^\**(훅|오프닝|전개|반전|클라이맥스|여운|끝|Hook|Opening|Build-up|Buildup|Climax|Twist|Linger|Ending)\**:?\s*/i, ''))
    .map(l => {
      // 화자 태그가 있으면 보존, 다른 [라벨]만 제거
      if (SPEAKER_TAG_RE.test(l)) return l;
      return l.replace(/^\[.*?\]\s*/, '');
    })
    .filter(l => l && !l.startsWith('**') && !l.startsWith('##'));

  return lines.join('\n');
}

// ===== 요약 나레이션 모드 =====
// 긴 영상을 분석 → 핵심 포인트 추출 → 하이라이트 구간 + 나레이션
// 원본에서 구간을 잘라오고 나레이션을 얹어서 요약 쇼츠 생성
async function generateSummaryNarration(segments, videoDurationSec, targetLang, config, onProgress) {
  onProgress('translate', 48, '하이라이트 분석 중...');

  const targetLangName = LANGUAGES[targetLang]?.name || '한국어';

  // 세그먼트를 타임스탬프 포함 텍스트로 변환
  const timelineText = segments
    .map((s, i) => `[${s.start.toFixed(1)}~${s.end.toFixed(1)}] ${s.text.trim()}`)
    .join('\n');

  // 목표 쇼츠 길이 (원본이 짧으면 그대로, 길면 30~60초로 압축)
  const targetShortDuration = videoDurationSec > 90 ? 45 : Math.min(videoDurationSec, 60);
  const pointCount = videoDurationSec > 120 ? 5 : (videoDurationSec > 60 ? 4 : 3);

  const prompt = `당신은 유튜브 요약 쇼츠 편집자입니다. 긴 영상을 분석해서 핵심만 뽑아낸 짧은 쇼츠용 나레이션 스크립트를 만드세요.

**원본 영상 정보:**
- 원본 길이: ${videoDurationSec.toFixed(1)}초
- 목표 쇼츠 길이: 약 ${targetShortDuration}초
- 핵심 포인트 개수: ${pointCount}개

**원본 스크립트 (타임스탬프 포함):**
${timelineText}

**작업:**
1. 이 영상에서 가장 핵심적인 포인트 ${pointCount}개를 선정하세요.
2. 각 포인트마다 ${targetLangName} 나레이션을 작성하세요 (각 3~8초 분량, 한국어는 1초당 약 7자).
3. 각 포인트가 원본 영상의 어느 구간(초)에 해당하는지 명시하세요.

**나레이션 스타일:**
- 반말체, 친구한테 설명하듯이
- 짧고 임팩트 있게
- 첫 포인트는 **훅**으로 시작 ("이 영상 꼭 봐", "이거 대박이야")
- 마지막 포인트는 **결론/강조**로 마무리

**출력 형식 (JSON 배열, 다른 설명 없이 JSON만):**
[
  {
    "narration": "이거 진짜 미쳤어 꼭 봐봐",
    "clipStart": 0.0,
    "clipEnd": 5.0
  },
  {
    "narration": "첫 번째 포인트는 접이식이라는 거야",
    "clipStart": 12.5,
    "clipEnd": 18.0
  }
]

**규칙:**
- clipStart와 clipEnd는 원본 영상 안의 초 단위
- 각 clip은 최소 2초 이상, 최대 10초 이하
- 순서대로 배치 (clipStart가 뒤로 갈수록 증가)
- 나레이션 글자수는 clip 길이와 대략 맞아야 함 (clip 5초 = 나레이션 약 35자)
- JSON 외에 다른 텍스트 절대 금지

**이제 JSON을 출력하세요:**`;

  const content = await callLLM(
    [{ role: 'user', content: prompt }],
    config
  );

  // JSON 파싱
  let points = [];
  try {
    // JSON 부분만 추출 (LLM이 앞뒤에 설명 붙일 수 있음)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      points = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('JSON not found');
    }
  } catch (e) {
    console.error('나레이션 JSON 파싱 실패:', e.message);
    console.error('응답 내용:', content.substring(0, 500));
    throw new Error('요약 나레이션 생성 실패 - LLM 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
  }

  // 유효성 검증
  points = points.filter(p =>
    p.narration && typeof p.narration === 'string' &&
    typeof p.clipStart === 'number' && typeof p.clipEnd === 'number' &&
    p.clipEnd > p.clipStart &&
    p.clipStart >= 0 && p.clipEnd <= videoDurationSec + 5
  );

  if (points.length === 0) {
    throw new Error('요약 나레이션 생성 실패 - 유효한 포인트가 없습니다');
  }

  return points;
}

// ===== 요약 나레이션 모드: 하이라이트 클립 추출 + 나레이션 오버레이 =====
// 원본 영상에서 각 구간을 잘라내고 나레이션을 입혀서 최종 쇼츠 생성
async function renderSummaryVideo({
  originalPath,
  points,
  ttsVoice,
  outputPath,
  jobDir,
  onProgress,
}) {
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const edgeTts = process.platform === 'win32' ? 'edge-tts.exe' : 'edge-tts';

  onProgress('tts', 60, '나레이션 음성 생성 중...');

  // 1. 각 포인트의 나레이션 TTS 생성 + 길이 측정
  const pointsWithTTS = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    onProgress('tts', 60 + (i / points.length) * 8, `나레이션 ${i + 1}/${points.length}`);

    const ttsPath = path.join(jobDir, `narr_${i}.mp3`);
    try {
      await runCommand(edgeTts, [
        '--voice', ttsVoice,
        '--rate', '+10%', // 살짝 빠르게
        '--text', p.narration,
        '--write-media', ttsPath,
      ]);
      const ttsDuration = await getMediaDuration(ttsPath);
      pointsWithTTS.push({
        ...p,
        ttsPath,
        ttsDuration,
      });
    } catch (e) {
      console.error(`나레이션 ${i} TTS 실패:`, e.message);
    }
  }

  if (pointsWithTTS.length === 0) {
    throw new Error('나레이션 TTS 생성 실패');
  }

  onProgress('compose', 70, '하이라이트 구간 추출 중...');

  // 2. 각 포인트마다 clip 추출 + 길이를 나레이션 길이에 맞춤
  // 전략: 원본 clip 길이 vs 나레이션 길이 비교
  //  - 원본이 나레이션보다 길면: 원본을 빠르게 (setpts로 압축)
  //  - 원본이 나레이션보다 짧으면: 원본을 느리게 (setpts로 연장)
  //  - 너무 차이 크면 (2배 이상) 그냥 정상 속도로 두고 loop/trim
  const clipPaths = [];
  for (let i = 0; i < pointsWithTTS.length; i++) {
    const p = pointsWithTTS[i];
    onProgress('compose', 70 + (i / pointsWithTTS.length) * 10, `클립 추출 ${i + 1}/${pointsWithTTS.length}`);

    const clipDuration = p.clipEnd - p.clipStart;
    const targetDuration = p.ttsDuration;

    // 속도 비율 (clipDuration을 targetDuration으로 맞추려면)
    let speedRatio = clipDuration / targetDuration;
    // 0.5 ~ 2.0 사이로 제한
    if (speedRatio < 0.5) speedRatio = 0.5;
    if (speedRatio > 2.0) speedRatio = 2.0;

    // setpts = 1/speedRatio (값이 작을수록 빨라짐)
    const ptsMultiplier = (1 / speedRatio).toFixed(3);

    const clipPath = path.join(jobDir, `clip_${i}.mp4`);

    // 원본에서 구간 추출 + 속도 조절 + 원본 오디오 볼륨 낮춤 (덕킹) + 나레이션 믹스
    // 입력 1: 원본 영상 (구간)
    // 입력 2: 나레이션 TTS
    const filterComplex = [
      `[0:v]setpts=${ptsMultiplier}*PTS[v]`,
      `[0:a]atempo=${speedRatio.toFixed(3)},volume=0.15[abg]`, // 원본 오디오 15%로 덕킹
      `[abg][1:a]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`,
    ].join(';');

    try {
      await runCommand(ffmpeg, [
        '-y',
        '-ss', p.clipStart.toFixed(3),
        '-to', p.clipEnd.toFixed(3),
        '-i', originalPath,
        '-i', p.ttsPath,
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', targetDuration.toFixed(3), // 나레이션 길이만큼만
        clipPath,
      ]);
      clipPaths.push({ path: clipPath, start: 0, duration: targetDuration, narration: p.narration });
    } catch (e) {
      console.error(`클립 ${i} 생성 실패:`, e.message);
    }
  }

  if (clipPaths.length === 0) {
    throw new Error('하이라이트 클립 생성 실패');
  }

  onProgress('compose', 82, '클립 이어붙이기...');

  // 3. 모든 clip을 concat으로 이어붙임
  // ffmpeg concat demuxer 사용 (파일 리스트 방식)
  const concatListPath = path.join(jobDir, 'concat_list.txt');
  const concatContent = clipPaths.map(c => `file '${c.path.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatListPath, concatContent, 'utf-8');

  const concatPath = path.join(jobDir, 'concat.mp4');
  try {
    await runCommand(ffmpeg, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      concatPath,
    ]);
  } finally {
    try { fs.unlinkSync(concatListPath); } catch (e) {}
  }

  // 4. 자막용 세그먼트 생성 (각 clip 시작 시간 누적)
  const summarySubtitleSegments = [];
  let accumTime = 0;
  for (const c of clipPaths) {
    summarySubtitleSegments.push({
      start: accumTime,
      end: accumTime + c.duration,
      text: c.narration,
    });
    accumTime += c.duration;
  }

  // 정리
  clipPaths.forEach(c => { try { fs.unlinkSync(c.path); } catch (e) {} });
  pointsWithTTS.forEach(p => { try { fs.unlinkSync(p.ttsPath); } catch (e) {} });

  return {
    concatPath,
    segments: summarySubtitleSegments,
  };
}

// ===== ElevenLabs TTS =====
async function generateElevenLabsTTS(text, voiceId, outputPath, apiKey, onProgress) {
  onProgress('tts', 65, `ElevenLabs 음성 생성 중...`);
  
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    
    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log(`[ElevenLabs] TTS 생성 완료: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('[ElevenLabs] TTS 오류:', error.response?.data || error.message);
    throw new Error('ElevenLabs TTS 실패: ' + (error.response?.status === 401 ? 'API 키 오류' : error.message));
  }
}

// ===== 🆕 타입캐스트 TTS =====
async function generateTypecastTTS(text, voiceId, outputPath, apiKey, onProgress) {
  onProgress('tts', 65, `타입캐스트 음성 생성 중...`);
  
  try {
    console.log(`[Typecast] API 호출: voice_id=${voiceId}, text="${text.substring(0, 30)}..."`);
    
    const response = await axios.post(
      'https://api.typecast.ai/v1/text-to-speech',
      {
        text: text,
        model: 'ssfm-v30',
        voice_id: voiceId,
        prompt: {
          emotion_type: 'smart',
        },
        output: {
          audio_format: 'mp3',
          volume: 100,
        },
      },
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    
    // 🔧 응답 검증 - 진짜 mp3인지 확인
    const buffer = Buffer.from(response.data);
    const fileSize = buffer.length;
    
    // 응답 헤더 확인
    const contentType = response.headers['content-type'] || '';
    console.log(`[Typecast] 응답 status=${response.status}, content-type=${contentType}, size=${fileSize} bytes`);
    
    // mp3 파일 시그니처 체크 (ID3 또는 0xFF로 시작)
    const isMp3 = (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||  // ID3
      (buffer[0] === 0xFF && (buffer[1] === 0xFB || buffer[1] === 0xF3 || buffer[1] === 0xF2))  // MPEG sync
    );
    
    // JSON 응답이면 (에러)
    if (contentType.includes('json') || (buffer[0] === 0x7B && buffer[1] === 0x22)) {  // {"
      const jsonText = buffer.toString('utf8');
      console.error('[Typecast] ❌ JSON 응답 받음 (mp3 아님):', jsonText);
      throw new Error('타입캐스트가 mp3 대신 JSON 응답: ' + jsonText.substring(0, 200));
    }
    
    if (!isMp3) {
      console.error('[Typecast] ⚠️ mp3 파일이 아닐 수 있음! 첫 4바이트:', buffer.slice(0, 4).toString('hex'));
      console.error('[Typecast] 첫 200자:', buffer.toString('utf8', 0, Math.min(200, fileSize)));
    } else {
      console.log('[Typecast] ✅ 정상 mp3 응답');
    }
    
    fs.writeFileSync(outputPath, buffer);
    console.log(`[Typecast] TTS 생성 완료: ${outputPath} (${fileSize} bytes)`);
    return outputPath;
  } catch (error) {
    const errMsg = error.response?.data 
      ? (Buffer.isBuffer(error.response.data) ? error.response.data.toString() : JSON.stringify(error.response.data))
      : error.message;
    console.error('[Typecast] TTS 오류 - status:', error.response?.status, 'msg:', errMsg);
    
    let userMsg = '타입캐스트 TTS 실패: ';
    if (error.response?.status === 401) userMsg += 'API 토큰 오류 (설정에서 확인)';
    else if (error.response?.status === 403) userMsg += '사용량 초과 또는 권한 없음';
    else if (error.response?.status === 404) userMsg += 'Voice ID 오류 (' + voiceId + ')';
    else userMsg += errMsg;
    
    throw new Error(userMsg);
  }
}

// ===== BGM 믹싱 =====
async function mixBGM(videoPath, bgmPath, bgmVolume, outputPath, onProgress) {
  onProgress('mix', 90, `BGM 믹싱 중 (${bgmVolume}%)...`);
  
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bgmVol = bgmVolume / 100; // 0~1 범위로 변환
  
  // 영상 길이 가져오기
  const videoDuration = await getMediaDuration(videoPath);
  
  // BGM을 영상 길이만큼 루프하고 볼륨 조절
  // amix: 영상 오디오 + BGM 믹싱
  await runCommand(ffmpeg, [
    '-y',
    '-i', videoPath,
    '-stream_loop', '-1', '-i', bgmPath, // BGM 무한 루프
    '-filter_complex', `[1:a]volume=${bgmVol},afade=t=out:st=${videoDuration - 2}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', String(videoDuration),
    outputPath
  ]);
  
  console.log(`[BGM] 믹싱 완료: ${outputPath}`);
  return outputPath;
}

// ===== 5단계: Edge TTS (전체 텍스트) =====
async function generateTTS(text, voice, outputPath, onProgress) {
  onProgress('tts', 65, `음성 더빙 생성 (${voice})...`);
  const edgeTts = process.platform === 'win32' ? 'edge-tts.exe' : 'edge-tts';
  // --text로 직접 전달 (파일 경로 문제 회피)
  // 텍스트가 너무 길면 command line limit에 걸릴 수 있어 파일로 fallback
  if (text.length < 5000) {
    await runCommand(edgeTts, ['--voice', voice, '--text', text, '--write-media', outputPath]);
  } else {
    const textFilePath = outputPath.replace(/\.mp3$/, '.txt');
    fs.writeFileSync(textFilePath, text, 'utf-8');
    try {
      await runCommand(edgeTts, ['--voice', voice, '--file', textFilePath, '--write-media', outputPath]);
    } finally {
      try { fs.unlinkSync(textFilePath); } catch (e) {}
    }
  }
  return outputPath;
}

// ===== 세그먼트별 TTS 생성 + 순차 이어붙이기 =====
// 원칙: 단순하게. 자막과 100% 싱크.
// 1. 각 청크를 개별 TTS
// 2. 자막 시작 시간에 맞춰 adelay로 배치
// 3. 겹침이 발생하면 다음 청크를 뒤로 밀기 (자막 타이밍도 같이 조정)
// 4. 최종적으로 자막 타이밍 = TTS 타이밍 = 100% 일치
async function generateTTSPerSegment(segments, voice, outputPath, jobDir, onProgress) {
  onProgress('tts', 60, '세그먼트별 음성 생성 중...');

  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  const edgeTts = process.platform === 'win32' ? 'edge-tts.exe' : 'edge-tts';
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  // 1. 각 청크 TTS 생성 (자동 속도 조절)
  // 전략: 원본 슬롯 길이 vs 번역 글자수로 필요한 속도를 "예측"
  // 한국어 TTS 기본 속도: 대략 초당 6-7자 (Edge TTS SunHiNeural 기준)
  const CHARS_PER_SECOND = 6.5; // 보통 속도 기준
  const MIN_RATE = -30; // -30% (느리게)
  const MAX_RATE = 50;  // +50% (빠르게)

  const rawAudios = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = (seg.text || '').trim();
    if (!text) continue;

    onProgress('tts', 60 + (i / segments.length) * 10, `음성 생성 ${i + 1}/${segments.length}`);

    // 자동 속도 계산
    // 원본이 이 말을 하는 데 걸린 시간 = seg.end - seg.start
    // 번역 텍스트를 보통 속도로 읽으면 걸릴 시간 = text.length / CHARS_PER_SECOND
    // 필요한 속도 비율 = 예상시간 / 원본시간
    const slotDuration = seg.end - seg.start;
    const charCount = text.replace(/\s/g, '').length; // 공백 제외
    const expectedDuration = charCount / CHARS_PER_SECOND;

    let ratePercent = 0;
    if (slotDuration > 0.3 && expectedDuration > 0.2) {
      const speedRatio = expectedDuration / slotDuration;
      // speedRatio가 1보다 크면 빠르게 해야 함
      ratePercent = Math.round((speedRatio - 1) * 100);
      // 제한
      if (ratePercent > MAX_RATE) ratePercent = MAX_RATE;
      if (ratePercent < MIN_RATE) ratePercent = MIN_RATE;
    }

    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    const segAudioPath = path.join(jobDir, `seg_${i}.mp3`);
    try {
      await runCommand(edgeTts, [
        '--voice', voice,
        '--rate', rateStr,
        '--text', text,
        '--write-media', segAudioPath,
      ]);
      const ttsDuration = await getMediaDuration(segAudioPath);
      rawAudios.push({
        path: segAudioPath,
        ttsDuration,
        idealStart: seg.start,
        slotDuration,
        text,
        ratePercent,
      });
    } catch (e) {
      console.error('TTS 실패:', i, text.substring(0, 30), '→', e.message);
    }
  }

  if (rawAudios.length === 0) {
    throw new Error('TTS 생성 실패');
  }

  onProgress('tts', 70, '음성 타이밍 조정 중...');

  // 2. 순차 배치 - 겹침 방지
  // 각 세그먼트는 "이상적 시작 시간"에서 시작하되,
  // 이전 세그먼트가 아직 재생 중이면 끝난 후에 시작
  const placed = [];
  let currentEnd = 0;
  // 🆕 세그먼트 사이 간격 0.1 → 0.05초로 줄임 (대장님 요청 - 자막/더빙 텀 줄이기)
  const GAP = 0.05;

  for (const raw of rawAudios) {
    const actualStart = Math.max(raw.idealStart, currentEnd + GAP);
    const actualEnd = actualStart + raw.ttsDuration;
    placed.push({
      path: raw.path,
      start: actualStart,
      end: actualEnd,
      duration: raw.ttsDuration,
      text: raw.text,
    });
    currentEnd = actualEnd;
  }

  // 3. ffmpeg로 합치기 - adelay + amix
  const filterParts = [];
  const inputArgs = [];
  placed.forEach((p, i) => {
    inputArgs.push('-i', p.path);
    const delayMs = Math.round(p.start * 1000);
    if (delayMs > 0) {
      filterParts.push(`[${i}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
    } else {
      filterParts.push(`[${i}:a]anull[a${i}]`);
    }
  });

  const mixInputs = placed.map((_, i) => `[a${i}]`).join('');
  filterParts.push(`${mixInputs}amix=inputs=${placed.length}:dropout_transition=0:normalize=0[aout]`);

  const filterComplex = filterParts.join(';');
  const filterScriptPath = outputPath.replace(/\.mp3$/, '.filter.txt');
  fs.writeFileSync(filterScriptPath, filterComplex, 'utf-8');

  try {
    await runCommand(ffmpeg, [
      '-y',
      ...inputArgs,
      '-filter_complex_script', filterScriptPath,
      '-map', '[aout]',
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      outputPath,
    ]);
  } finally {
    try { fs.unlinkSync(filterScriptPath); } catch (e) {}
    placed.forEach(p => {
      try { fs.unlinkSync(p.path); } catch (e) {}
    });
  }

  onProgress('tts', 72, '음성 합성 완료');

  // 4. 실제 재생 타이밍 반환 (자막이 여기에 맞춰 표시됨)
  return {
    outputPath,
    adjustedSegments: placed.map(p => ({
      start: p.start,
      end: p.end,
      text: p.text,
    })),
  };
}

async function getMediaDuration(mediaPath) {
  const ffprobe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const { stdout } = await runCommand(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', mediaPath,
  ]);
  return parseFloat(stdout.trim());
}

// ===== drawtext 이스케이프 =====
function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
}

function getFontPath(lang, customFont, sampleText) {
  // 커스텀 폰트가 지정되면 우선
  if (customFont && AVAILABLE_FONTS[customFont]) {
    return `C\\:/Windows/Fonts/${AVAILABLE_FONTS[customFont].file}`;
  }

  // 샘플 텍스트가 있으면 실제 사용된 문자로 언어 감지
  // (targetLang이 영어여도 자막에 한글이 있으면 한국어 폰트 필요)
  if (sampleText && typeof sampleText === 'string') {
    // 한글 포함 체크
    if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(sampleText)) {
      return `C\\:/Windows/Fonts/malgun.ttf`;
    }
    // 일본어 포함 체크 (히라가나 + 가타카나)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sampleText)) {
      return `C\\:/Windows/Fonts/YuGothM.ttc`;
    }
    // 중국어 포함 체크 (CJK 통합 한자)
    if (/[\u4E00-\u9FFF]/.test(sampleText)) {
      return `C\\:/Windows/Fonts/msyh.ttc`;
    }
  }

  const fontFile = LANGUAGES[lang]?.fontFile || 'malgun.ttf';
  return `C\\:/Windows/Fonts/${fontFile}`;
}

// ===== 사용 가능한 폰트 (Windows 기본) =====
const AVAILABLE_FONTS = {
  malgun: { name: '맑은 고딕', file: 'malgun.ttf', langs: ['ko'] },
  malgunbd: { name: '맑은 고딕 Bold', file: 'malgunbd.ttf', langs: ['ko'] },
  batang: { name: '바탕', file: 'batang.ttc', langs: ['ko'] },
  gulim: { name: '굴림', file: 'gulim.ttc', langs: ['ko'] },
  arial: { name: 'Arial', file: 'arial.ttf', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'] },
  arialbd: { name: 'Arial Bold', file: 'arialbd.ttf', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'] },
  impact: { name: 'Impact', file: 'impact.ttf', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'] },
  georgia: { name: 'Georgia', file: 'georgia.ttf', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'] },
  comic: { name: 'Comic Sans', file: 'comic.ttf', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'] },
  verdana: { name: 'Verdana', file: 'verdana.ttf', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'] },
  tahoma: { name: 'Tahoma', file: 'tahoma.ttf', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'] },
  yugothic: { name: '游ゴシック', file: 'YuGothM.ttc', langs: ['ja'] },
  msyahei: { name: '微软雅黑', file: 'msyh.ttc', langs: ['zh'] },
};

// ===== 자막 사이즈 프리셋 =====
const SIZE_PRESETS = {
  S: { name: '작게 (S)', fontSize: 36, borderWidth: 3 },
  M: { name: '보통 (M)', fontSize: 54, borderWidth: 5 },
  L: { name: '크게 (L)', fontSize: 72, borderWidth: 7 },
  XL: { name: '아주 크게 (XL)', fontSize: 96, borderWidth: 9 },
};

// ===== 자막 표시용 분할 =====
// 단순한 원칙:
// 1. 짧은 세그먼트(4초 이하)는 그대로
// 2. 긴 세그먼트(4초 이상)는 글자수로 균등 분할
// 3. 각 자막은 한 줄로 (최대 20자)
// 4. 시간순 정렬, 겹침 없음, 최소 0.6초 보장
function splitSegmentsForDisplay(segments, splitMode = 'phrase', targetLang = 'ko') {
  if (!segments || segments.length === 0) return [];

  const MAX_DURATION = 4.0;
  // 언어별 최대 글자수 (한 자막 청크당)
  // 한국어/일본어/중국어: 글자 단위로 짧게
  // 영어 등 알파벳: 글자수가 많지만 시각적으로는 비슷
  const MAX_CHARS_BY_LANG = {
    ko: 20, ja: 20, zh: 18, th: 22,
    en: 38, es: 38, fr: 38, de: 38, it: 38, pt: 38,
    ru: 32, vi: 32,
  };
  const MAX_CHARS = MAX_CHARS_BY_LANG[targetLang] || 30;
  const MIN_DURATION = 0.8;
  const GAP = 0;
  const START_OFFSET = 0.3;

  // 수동 [HL] 마커 처리 함수
  // 사용자가 직접 [HL]을 텍스트에 넣었을 수도 있으므로 여기서도 검사
  const processHighlight = (text, existingFlag) => {
    const hlMatch = text.match(/^\[HL\]\s*(.+)$/i);
    if (hlMatch) {
      return { text: hlMatch[1].trim(), highlight: true };
    }
    return { text, highlight: existingFlag === true };
  };

  // 1. 각 원본 세그먼트를 적절한 크기로 쪼갬
  const rawChunks = [];
  for (const seg of segments) {
    const processed = processHighlight((seg.text || '').trim(), seg.highlight);
    // 🆕 "/" 최종 안전 제거: 어느 경로를 타도 자막에 "/" 가 남지 않도록
    // ("/" 는 대본 편집 시 자막 분리 마커로만 쓰임 - 실제 영상엔 나오면 안 됨)
    // 대부분 상위에서 이미 처리되지만, 놓친 경로의 안전장치
    let text = processed.text.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
    const highlight = processed.highlight;
    if (!text) continue;
    const duration = seg.end - seg.start;
    if (duration <= 0) continue;

    if (duration <= MAX_DURATION && text.length <= MAX_CHARS) {
      rawChunks.push({
        start: seg.start + START_OFFSET,
        end: seg.end,
        text,
        highlight,
      });
      continue;
    }

    // 길면 나눔
    const chunks = splitTextIntoChunks(text, MAX_CHARS);
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);

    let t = seg.start + START_OFFSET;
    const adjustedDuration = seg.end - t;

    chunks.forEach((chunk, idx) => {
      const ratio = chunk.length / totalLen;
      let chunkDur = adjustedDuration * ratio;
      const isLast = idx === chunks.length - 1;
      const chunkEnd = isLast ? seg.end : t + chunkDur;

      rawChunks.push({
        start: t,
        end: chunkEnd,
        text: chunk,
        highlight, // 분할되어도 원본 강조 상태 유지
      });
      t = chunkEnd;
    });
  }

  // 2. 시간순 정렬 + 겹침 제거
  rawChunks.sort((a, b) => a.start - b.start);

  const result = [];
  let lastEnd = 0;
  for (const chunk of rawChunks) {
    let start = Math.max(chunk.start, lastEnd + GAP);
    let end = chunk.end;
    // 이전 자막이 너무 뒤까지 갔으면 start가 end를 넘을 수 있음 - 방지
    if (start >= end) {
      // 원본 범위를 최대한 유지: start는 이전 자막 바로 뒤, end는 원본 end
      end = Math.max(start + MIN_DURATION, chunk.end);
    }
    let duration = end - start;

    if (duration < MIN_DURATION) {
      end = start + MIN_DURATION;
    }
    // MAX_DURATION으로 자르지 않음 - 긴 구간도 자막이 계속 표시되도록
    // (이전 버전에서는 end = start + MAX_DURATION 으로 잘라서 자막이 중간에 사라지는 버그가 있었음)

    result.push({ start, end, text: chunk.text, highlight: chunk.highlight });
    lastEnd = end;
  }

  return result;
}

// 텍스트를 자연스러운 지점에서 분할
// 🔴 핵심: 단어 중간에서 절대 끊지 않음! 공백 기준으로만 끊기!
// ===== 한국어 자연 분할 함수들 =====

// 숫자 보호 (분할 시 숫자+단위 깨지지 않게)
function protectNumbers(text) {
  return text.replace(/(\d+(\.\d+)?)([a-zA-Z가-힣]*)/g, '§$1$3§');
}

function restoreNumbers(text) {
  return text.replace(/§(.*?)§/g, '$1');
}

// 형태소 보호 개선
function safeSplit(text) {
  return text
    // 조사 보호 (붙어있게 유지)
    .replace(/([가-힣])([은는이가을를에에서으로])/g, '$1$2 ')
    
    // 종결 어미 뒤만 끊기
    .replace(/([가-힣])(다|요|죠|함|임)/g, '$1$2 ')
    
    // 연결어 앞뒤만 분리
    .replace(/(그리고|근데|그래서|그러다가|근데도)/g, ' $1 ')
    
    // 특수문자 기준
    .replace(/([,.!?])/g, '$1 ')
    
    .split(/\s+/)
    .filter(Boolean);
}

// 길이 유동 (조금 더 자연스럽게 수정)
function getKoreanLimit() {
  const r = Math.random();
  if (r < 0.25) return 8;   
  if (r < 0.7) return 14;  
  return 22;               
}

function mergeNaturalKorean(words) {
  const result = [];
  let current = '';
  words.forEach(word => {
    const limit = getKoreanLimit();
    const next = (current + ' ' + word).trim();
    if (next.length > limit && current !== '') {
      result.push(current.trim());
      current = word;
    } else {
      current = next;
    }
  });
  if (current) result.push(current.trim());
  return result;
}

// TTS 자연화
function addTTS(line, i, total) {
  if (i === total - 1) return line + '!';
  if (line.length <= 7) return line + ',';
  if (Math.random() < 0.3) return line + '...';
  return line;
}

function processKorean(text) {
  text = protectNumbers(text);
  const words = safeSplit(text);
  let lines = mergeNaturalKorean(words);
  lines = lines.map((l, i) => addTTS(l, i, lines.length));
  lines = lines.map(restoreNumbers);
  return lines;
}

// 한국어 텍스트 자연 분할 (메인 함수)
function splitKoreanNatural(text, maxChars) {
  if (!text || text.length === 0) return [];
  
  const cleaned = text.replace(/[.!?~,，。！？\s]/g, '');
  if (cleaned.length === 0) return [];
  
  text = text.trim();
  if (text.length <= maxChars) return [text];
  
  // 새 processKorean 사용
  return processKorean(text);
}

// 기존 함수 (호환성 유지)
function splitTextIntoChunks(text, maxChars) {
  // 한국어 포함 여부 체크
  const hasKorean = /[가-힣]/.test(text);
  
  if (hasKorean) {
    return splitKoreanNatural(text, maxChars);
  }
  
  // 영어/기타 언어는 기존 로직
  if (!text || text.length === 0) return [];
  
  const cleaned = text.replace(/[.!?~,，。！？\s]/g, '');
  if (cleaned.length === 0) return [];
  
  text = text.trim();
  if (text.length <= maxChars) return [text];

  const result = [];
  const words = text.split(/\s+/);
  
  let currentChunk = '';
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testChunk = currentChunk ? currentChunk + ' ' + word : word;
    
    if (testChunk.length <= maxChars) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        result.push(currentChunk);
      }
      currentChunk = word;
    }
  }
  
  if (currentChunk) {
    result.push(currentChunk);
  }
  
  return result;
}

// 긴 텍스트를 줄바꿈으로 여러 줄로 만들기
// drawtext는 \n을 줄바꿈으로 인식
// 🔴 주의: 이 함수는 한 자막 내 줄바꿈용. 별도 자막으로 나누려면 splitTextIntoChunks 사용
function wrapTextInLines(text, maxCharsPerLine = 18) {
  // 이미 짧으면 그대로
  if (text.length <= maxCharsPerLine) return text;
  
  const hasSpaces = /\s/.test(text);
  
  if (hasSpaces) {
    // 🆕 공백 기준 분할: 자연스러운 2줄로
    const words = text.split(/\s+/).filter(Boolean);
    
    // 🆕 2줄로 최적 분할: 글자수가 거의 균등하게 나뉘도록
    if (words.length >= 2) {
      const totalLen = text.length;
      const targetLen = totalLen / 2;
      
      let bestSplit = 1;
      let bestDiff = Infinity;
      
      // 각 단어 경계에서 분할 시 균형 점수 계산
      for (let i = 1; i < words.length; i++) {
        const line1 = words.slice(0, i).join(' ');
        const line2 = words.slice(i).join(' ');
        const diff = Math.abs(line1.length - line2.length);
        
        // 가장 균형 잡힌 분할 지점 찾기
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplit = i;
        }
      }
      
      const line1 = words.slice(0, bestSplit).join(' ');
      const line2 = words.slice(bestSplit).join(' ');
      return line1 + '\n' + line2;
    }
    
    // 단어 1개면 그대로
    return text;
  } else {
    // 🔴 한국어: 줄바꿈 없이 그대로 반환 (긴 자막은 splitTextIntoChunks에서 이미 분리됨)
    // 한 자막 내에서 줄바꿈하면 읽기 어려움 → 차라리 다음 자막으로 넘기는 게 나음
    return text;
  }
}

// 단어 모드: 공백 기준 + 너무 짧은 건 앞뒤랑 합침
function splitIntoWords(text) {
  const raw = text.split(/\s+/).filter(Boolean);
  // 단일 글자(조사 등)는 앞 단어에 붙임
  const result = [];
  for (const w of raw) {
    if (w.length <= 1 && result.length > 0) {
      result[result.length - 1] += ' ' + w;
    } else {
      result.push(w);
    }
  }
  return result;
}

// 구(句) 모드: 한국어 구문 경계 감지 기반 분할
// 한국어의 자연스러운 구문 경계:
//   - 조사로 끝나는 어절 뒤 (은/는/이/가/을/를/의/에...)
//   - 관형형 어미 뒤 (~ㄴ/은/는/ㄹ/을)
//   - 연결어미 뒤 (~고/~면/~니까/~서/~는데...)
//   - 구두점 뒤
function splitIntoPhrases(text) {
  // 구두점으로 1차 분할
  const bigChunks = text
    .replace(/([.!?。！？,,、])\s*/g, '$1|')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);

  const result = [];

  for (const big of bigChunks) {
    const words = big.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    // 각 단어 뒤에 경계 점수 매기기 (0=약함, 3=강함)
    const boundaries = words.map((word, i) => {
      if (i === words.length - 1) return 0; // 마지막은 의미 없음
      return getBoundaryScore(word);
    });

    // 덩어리 만들기: 경계가 있는 지점에서 자르되, 너무 짧으면 합치기
    const TARGET_LEN = 5;  // 이상적인 덩어리 길이 (글자수)
    const MIN_LEN = 2;     // 너무 짧으면 합침
    const MAX_LEN = 10;    // 절대 최대

    let current = [words[0]];
    let currentLen = words[0].length;

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const wordLen = word.length;
      const prevBoundary = boundaries[i - 1]; // 직전 단어 뒤의 경계 점수

      // 현재가 너무 짧으면 무조건 합침
      if (currentLen < MIN_LEN) {
        current.push(word);
        currentLen += wordLen;
        continue;
      }

      // 현재 + 새 단어가 MAX 넘으면 강제 분할
      if (currentLen + wordLen > MAX_LEN) {
        result.push(current.join(' '));
        current = [word];
        currentLen = wordLen;
        continue;
      }

      // 경계 점수가 강하면 (2 이상) 자르기
      if (prevBoundary >= 2) {
        // 단, 현재가 너무 짧고 새 단어 추가해도 TARGET 근처면 합치기
        if (currentLen < TARGET_LEN - 2 && currentLen + wordLen <= TARGET_LEN + 2) {
          current.push(word);
          currentLen += wordLen;
        } else {
          result.push(current.join(' '));
          current = [word];
          currentLen = wordLen;
        }
        continue;
      }

      // 경계 점수 약하면 (0) → 합침
      // 경계 점수 1 → 현재가 TARGET 이상이면 자르고, 아니면 합침
      if (prevBoundary === 1 && currentLen >= TARGET_LEN) {
        result.push(current.join(' '));
        current = [word];
        currentLen = wordLen;
      } else {
        current.push(word);
        currentLen += wordLen;
      }
    }

    if (current.length > 0) {
      // 마지막 덩어리가 너무 짧으면 이전 덩어리에 합침
      if (currentLen < MIN_LEN && result.length > 0) {
        result[result.length - 1] += ' ' + current.join(' ');
      } else {
        result.push(current.join(' '));
      }
    }
  }

  return result.filter(Boolean);
}

// 단어 뒤 경계 점수 계산 (0: 약함, 1: 보통, 2: 강함, 3: 최강)
function getBoundaryScore(word) {
  // 조사 끝: 은/는/이/가/을/를/의/에/에서/으로/로/와/과/도/만/까지/부터/한테/에게/께/라고/이라고
  if (/[은는이가을를의에]$/.test(word)) return 2;
  if (/(에서|으로|와|과|도|만|까지|부터|한테|에게|라고|이라고|처럼|보다|마다)$/.test(word)) return 2;

  // 관형형 어미: 수식어 끝 → 다음은 체언 (끊기 좋음)
  // ~은/ㄴ (먹은, 예쁜), ~을/ㄹ (먹을, 예쁠), ~는 (먹는, 예쁜)
  if (/(은|는|을)$/.test(word) && word.length >= 2) return 2;
  if (/(했던|하던|했을|할|하는|한)$/.test(word)) return 2;

  // 연결어미: 절 끝
  if (/(고|며|면서|면|니까|서|는데|지만|거나|든지|아서|어서)$/.test(word)) return 2;

  // 인용/감탄
  if (/(라며|라고|다고|라는|다는|냐고|자고)$/.test(word)) return 2;

  // 종결어미 (문장 끝)
  if (/(다|요|까|자|네|구나|니|어|아)$/.test(word)) return 3;

  // 약한 경계: 일반 단어 (기본)
  return 0;
}

// 문장 단위 자연 분할: 구두점 + 접속사 기반
function splitIntoNaturalChunks(text) {
  const MAX_CHARS = 18;
  const MIN_CHARS = 6;

  const BREAK_WORDS = [
    '그리고', '그런데', '하지만', '그래서', '그러면', '왜냐하면', '때문에',
    '만약', '만일', '아니면', '또는', '즉', '또한', '그러나', '따라서',
    'and', 'but', 'so', 'because', 'if', 'or', 'then', 'when', 'while',
  ];

  // 구두점으로 1차 분할
  const bigChunks = text
    .replace(/([.!?。！？,，、])\s*/g, '$1|')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);

  const result = [];
  for (const big of bigChunks) {
    // 접속사 앞에서 분할
    let parts = [big];
    for (const bw of BREAK_WORDS) {
      const newParts = [];
      for (const p of parts) {
        const re = new RegExp(`(?=\\b${bw}\\b)`, 'gi');
        const split = p.split(re).map(s => s.trim()).filter(Boolean);
        newParts.push(...split);
      }
      parts = newParts;
    }

    // MAX_CHARS 넘는 건 공백 단위로 강제 분할
    const finalParts = [];
    for (const p of parts) {
      if (p.length <= MAX_CHARS) {
        finalParts.push(p);
      } else {
        const words = p.split(/\s+/);
        let current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length > MAX_CHARS) {
            if (current) finalParts.push(current.trim());
            current = w;
          } else {
            current = current ? current + ' ' + w : w;
          }
        }
        if (current.trim()) finalParts.push(current.trim());
      }
    }

    // 너무 짧은 조각은 이전 조각에 합치기
    for (const part of finalParts) {
      const last = result[result.length - 1];
      if (last && last.length < MIN_CHARS && (last.length + part.length + 1) <= MAX_CHARS) {
        result[result.length - 1] = last + ' ' + part;
      } else {
        result.push(part);
      }
    }
  }
  return result.filter(Boolean);
}

// ===== 6단계: ffmpeg 최종 합성 =====
async function composeFinalVideo({
  videoPath, ttsPath, segments, outputPath, jobDir, config, targetLang, onProgress,
}) {
  onProgress('compose', 75, '최종 영상 합성 (ffmpeg)...');

  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const isShorts = config.format !== 'longform';
  const targetW = isShorts ? 1080 : 1920;
  const targetH = isShorts ? 1920 : 1080;

  // ===== 새 템플릿 시스템 (config.useTemplate && config.template 객체) =====
  const useNewTemplate = config.useTemplate && config.template && typeof config.template === 'object';
  const newTemplate = useNewTemplate ? config.template : null;
  
  // ===== 기존 템플릿 설정 (호환성) =====
  // template: 'off' | 'top' | 'topbottom'
  // templateTitle: 상단 제목 텍스트
  // templateSubtitle: 하단 텍스트 (topbottom에서만)
  // templateVideoY: 영상을 템플릿 내에서 얼마나 위/아래 둘지 (%)
  let template = config.template || 'off';
  let templateTitle = (config.templateTitle || '').trim();
  let templateSubtitle = (config.templateSubtitle || '').trim();
  let templateVideoY = config.templateVideoY !== undefined ? config.templateVideoY : 50;
  
  // 새 템플릿 시스템이면 설정 덮어쓰기
  if (useNewTemplate) {
    template = 'top'; // 새 템플릿은 기본 'top' 스타일
    templateTitle = newTemplate.title?.text || '';
    templateVideoY = newTemplate.videoArea?.y || 18;
    console.log('[template] 새 템플릿 적용:', newTemplate.name);
  }

  // 템플릿 영역 계산 (쇼츠 기준, 롱폼은 비활성화 권장)
  let topBarH = 0;
  let bottomBarH = 0;

  if (useNewTemplate) {
    // 새 템플릿: videoArea.y 기준으로 상단 영역 계산
    const videoY = newTemplate.videoArea?.y || 18;
    const videoH = newTemplate.videoArea?.height || 65;
    topBarH = Math.floor(targetH * (videoY / 100));
    bottomBarH = Math.floor(targetH * ((100 - videoY - videoH) / 100));
  } else if (template === 'top') {
    topBarH = Math.floor(targetH * 0.22); // 상단 22%
  } else if (template === 'topbottom') {
    topBarH = Math.floor(targetH * 0.18); // 상단 18%
    bottomBarH = Math.floor(targetH * 0.14); // 하단 14%
  }

  const videoAreaH = targetH - topBarH - bottomBarH;

  const filters = [];
  let videoFilter = '[0:v]';
  if (config.useFlip) videoFilter += 'hflip,';

  // 🆕 템플릿 배경 이미지 처리 (base64 → 파일)
  let templateBgPath = null;
  if (useNewTemplate && newTemplate.backgroundImage) {
    try {
      const bgBase64 = newTemplate.backgroundImage;
      // data:image/png;base64,xxx 형식에서 데이터 추출
      const matches = bgBase64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const data = Buffer.from(matches[2], 'base64');
        templateBgPath = path.join(tempDir, `template_bg.${ext}`);
        fs.writeFileSync(templateBgPath, data);
        console.log(`[template] 배경 이미지 저장: ${templateBgPath}`);
      }
    } catch (e) {
      console.warn('[template] 배경 이미지 처리 실패:', e.message);
    }
  }

  // 비율 변환 - 템플릿이 있으면 영상을 영상 영역에만 맞춤
  if (template !== 'off') {
    // 템플릿 모드: 배경(검정 or 이미지) 위에 영상 영역만 scale
    const videoTargetW = targetW;
    const videoTargetH = videoAreaH;
    
    // 🆕 영상 X 위치 (새 템플릿이면 videoArea.x 사용)
    let videoX = '(W-w)/2'; // 기본 중앙
    if (useNewTemplate && newTemplate.videoArea?.x !== undefined) {
      const xPercent = newTemplate.videoArea.x;
      // x가 0이면 왼쪽, 50이면 중앙, 100이면 오른쪽
      // overlay는 왼쪽 상단 기준이라 계산 필요
      // x=10%면 왼쪽에서 (targetW - videoW) * 0.1 위치
      videoX = `(W-w)*${(xPercent / 100).toFixed(3)}`;
    }

    if (templateBgPath) {
      // 배경 이미지가 있으면 이미지 위에 영상 overlay
      filters.push(
        // 배경 이미지 스케일
        `movie='${templateBgPath.replace(/\\/g, '/').replace(/:/g, '\\:')}',scale=${targetW}:${targetH}[bg_img]`,
        // 영상 스케일 + crop
        `${videoFilter}scale=${videoTargetW}:${videoTargetH}:force_original_aspect_ratio=increase,crop=${videoTargetW}:${videoTargetH}[vscaled]`,
        // 배경 위에 영상 overlay
        `[bg_img][vscaled]overlay=${videoX}:${topBarH}[composited_raw]`
      );
    } else {
      // 배경 이미지 없으면 검은 배경
      filters.push(
        `color=c=black:s=${targetW}x${targetH}:d=3600[bg_black]`,
        `${videoFilter}scale=${videoTargetW}:${videoTargetH}:force_original_aspect_ratio=increase,crop=${videoTargetW}:${videoTargetH}[vscaled]`,
        `[bg_black][vscaled]overlay=${videoX}:${topBarH}[composited_raw]`
      );
    }
  } else if (config.useLetterbox) {
    filters.push(
      `${videoFilter}split=2[bg][fg]`,
      `[bg]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=20:5[bgblur]`,
      `[fg]scale=${targetW}:-1[fgscaled]`,
      `[bgblur][fgscaled]overlay=(W-w)/2:(H-h)/2[composited_raw]`
    );
  } else {
    filters.push(
      `${videoFilter}scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black[composited_raw]`
    );
  }

  // 원본 자막 블러 가리기 (선택)
  // useBlurMask + blurMaskSettings 또는 blurOriginalSub 사용
  const useBlur = config.useBlurMask || (config.blurOriginalSub && config.blurOriginalSub !== 'off');
  console.log(`[blur] useBlur=${useBlur}, useBlurMask=${config.useBlurMask}, blurMaskSettings=`, config.blurMaskSettings);
  
  if (useBlur) {
    let blurX, blurY, blurW, blurH, blurStrength;
    
    if (config.useBlurMask && config.blurMaskSettings) {
      // 새 방식: blurMaskSettings { pos (bottom %), height (px), strength }
      const settings = config.blurMaskSettings;
      // pos: CSS bottom 기준 (0% = 맨 아래, 100% = 맨 위)
      // 미리보기: bottom: pos% → 블러 바닥이 화면 하단에서 pos% 위치
      
      blurX = 0;
      blurW = targetW;
      blurH = settings.height || 30;
      blurStrength = settings.strength || 8;
      
      // ffmpeg Y 좌표 = 위에서부터 계산
      // CSS bottom: pos% 는 요소 바닥이 화면 하단에서 pos% 위치
      // ffmpeg Y = 화면높이 - (화면높이 * pos/100) - 블러높이
      // 단, pos%는 전체 높이의 퍼센트
      blurY = Math.floor(targetH * (1 - settings.pos / 100) - blurH);
      blurY = Math.max(0, Math.min(targetH - blurH, blurY));
      
      console.log(`[blur] 적용! pos=${settings.pos}% → blurY=${blurY}px (top에서), height=${blurH}px, strength=${blurStrength}`);
    } else {
      // 기존 방식: blurOriginalSub 프리셋
      const preset = config.blurOriginalSub;
      blurStrength = 30;

      if (preset === 'bottom') {
        blurX = 0;
        blurY = Math.floor(targetH * 0.70);
        blurW = targetW;
        blurH = Math.floor(targetH * 0.20);
      } else if (preset === 'middle') {
        blurX = 0;
        blurY = Math.floor(targetH * 0.55);
        blurW = targetW;
        blurH = Math.floor(targetH * 0.15);
      } else if (preset === 'top') {
        blurX = 0;
        blurY = Math.floor(targetH * 0.05);
        blurW = targetW;
        blurH = Math.floor(targetH * 0.15);
      } else if (preset === 'custom' && config.blurArea) {
        blurX = Math.floor(targetW * (config.blurArea.xPercent || 0) / 100);
        blurY = Math.floor(targetH * (config.blurArea.yPercent || 70) / 100);
        blurW = Math.floor(targetW * (config.blurArea.wPercent || 100) / 100);
        blurH = Math.floor(targetH * (config.blurArea.hPercent || 20) / 100);
      } else {
        blurX = 0;
        blurY = Math.floor(targetH * 0.70);
        blurW = targetW;
        blurH = Math.floor(targetH * 0.20);
      }
    }

    // 복제 → 블러 → crop → overlay
    // boxblur 값 범위 체크 (최소 1, 최대 영역 크기의 절반)
    const safeBlurStrength = Math.max(1, Math.min(blurStrength, Math.floor(Math.min(blurW, blurH) / 2) || 1));
    const safeBlurH = Math.max(2, blurH);
    const safeBlurY = Math.max(0, Math.min(targetH - safeBlurH, blurY));
    
    console.log(`[blur] final: W=${blurW}, H=${safeBlurH}, Y=${safeBlurY}, strength=${safeBlurStrength}`);
    
    filters.push(
      `[composited_raw]split=2[base_for_blur][blur_src]`,
      `[blur_src]crop=${blurW}:${safeBlurH}:${blurX}:${safeBlurY},boxblur=${safeBlurStrength}:${safeBlurStrength}[blurred]`,
      `[base_for_blur][blurred]overlay=${blurX}:${safeBlurY}[composited]`
    );
  } else {
    // 블러 없음 - composited_raw를 composited로 패스스루
    filters.push(`[composited_raw]null[composited]`);
  }

  // ===== 템플릿 제목 그리기 =====
  // 템플릿이 켜져 있으면 상단/하단 검은 띠 위에 제목 텍스트
  // [[단어]]로 감싸진 부분은 강조색(기본 노란)으로 표시
  let templateLastLabel = 'composited';

  // [[word]] 파싱 함수 - 텍스트를 세그먼트들로 분할
  // 반환: [{text, highlight}, ...]
  function parseHighlightSegments(text) {
    const segments = [];
    const regex = /\[\[(.+?)\]\]/g;
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      // match 앞쪽 일반 텍스트
      if (match.index > lastIdx) {
        segments.push({ text: text.substring(lastIdx, match.index), highlight: false });
      }
      // 강조 텍스트
      segments.push({ text: match[1], highlight: true });
      lastIdx = regex.lastIndex;
    }
    // 남은 일반 텍스트
    if (lastIdx < text.length) {
      segments.push({ text: text.substring(lastIdx), highlight: false });
    }
    if (segments.length === 0) {
      segments.push({ text, highlight: false });
    }
    return segments;
  }

  // 한 줄 텍스트를 여러 drawtext로 그리기 (단어별 색 지원)
  // x_center 기준 + 자동 너비 계산을 위해 FFmpeg 표현식 사용
  // 전략: 각 조각의 x 좌표를 앞 조각들 text_w의 누적으로 계산
  //
  // 복잡도 피하기 위해: 각 줄을 한 번에 그리되, [[word]] 부분만 별도 drawtext로
  // 오버레이. 간단하게 "전체를 한 색으로 + 강조 부분을 다른 색으로 덧그림"
  // 하지만 폰트가 겹치면 이상해지니까, 원래 부분을 공백으로 대체
  //
  // 가장 실용적 방법: 텍스트 전체를 한 번에 그리고, 강조 부분은
  // 좌표 계산해서 위에 덧그림. FFmpeg는 이걸 직접 못하므로,
  // **각 조각을 순차적으로 나열** - 첫 조각 그리고 그 다음 조각은 첫 조각 x+text_w 위치에
  //
  // 이것도 FFmpeg에서 text_w를 다른 drawtext가 참조 못함.
  //
  // ✅ 최종 실용 방법: 각 줄을 **조각별로 drawtext** 하되,
  //    각 조각의 x 위치를 Python으로 **미리 계산** (폰트 메트릭 없이 글자수 * 폰트크기 * 0.6)
  //    한글은 정사각형에 가까우니 글자 너비 ≈ fontSize * 0.95
  //    영문은 fontSize * 0.55
  //    대충 평균 fontSize * 0.75 사용

  function estimateTextWidth(text, fontSize) {
    // 글자별 대략 너비
    let w = 0;
    for (const ch of text) {
      if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch)) {
        w += fontSize * 0.98;  // 한글 정사각형
      } else if (/[a-zA-Z0-9]/.test(ch)) {
        w += fontSize * 0.55;  // 영문숫자 좁음
      } else if (/\s/.test(ch)) {
        w += fontSize * 0.35;  // 공백
      } else {
        w += fontSize * 0.7;
      }
    }
    return w;
  }

  // 여러 색으로 한 줄 그리기
  // parentLabel: 입력 스트림 레이블
  // lineText: 원본 텍스트 ([[]] 포함)
  // y: Y 좌표 (정수 또는 표현식 문자열)
  // fontSize, fontPath, highlightColor: 스타일
  // align: 'left' | 'center' | 'right'
  // xPercent: X 위치 (0~100%)
  // 반환: 마지막 레이블
  function drawMultiColorLine(parentLabel, lineText, y, fontSize, fontPath, highlightColor, outputPrefix, align = 'center', xPercent = 50) {
    const segs = parseHighlightSegments(lineText);

    // 전체 너비 계산
    let totalWidth = 0;
    for (const s of segs) {
      totalWidth += estimateTextWidth(s.text, fontSize);
    }

    // 시작 x = align과 xPercent 적용
    let startX;
    if (align === 'left') {
      // 왼쪽 정렬: xPercent% 위치에서 시작
      startX = Math.floor(targetW * (xPercent / 100));
    } else if (align === 'right') {
      // 오른쪽 정렬: xPercent% 위치에서 끝나도록
      startX = Math.floor(targetW * (xPercent / 100)) - totalWidth;
    } else {
      // 중앙 정렬: xPercent% 기준 중앙
      startX = Math.floor(targetW * (xPercent / 100)) - Math.floor(totalWidth / 2);
    }
    
    // 화면 밖으로 나가지 않게
    startX = Math.max(10, Math.min(startX, targetW - totalWidth - 10));

    let currentX = startX;
    let currentLabel = parentLabel;
    let counter = 0;

    for (const seg of segs) {
      if (!seg.text || seg.text.length === 0) continue;
      const escText = escapeDrawtext(seg.text);
      const color = seg.highlight ? toFFColor(highlightColor) : 'white';
      const segWidth = estimateTextWidth(seg.text, fontSize);
      const newLabel = `${outputPrefix}_${counter}`;
      counter++;

      filters.push(
        `[${currentLabel}]drawtext=fontfile='${fontPath}':text='${escText}':fontcolor=${color}:fontsize=${fontSize}:bordercolor=black:borderw=4:x=${Math.floor(currentX)}:y=${y}[${newLabel}]`
      );

      currentX += segWidth;
      currentLabel = newLabel;
    }

    return currentLabel;
  }

  if ((template !== 'off' && templateTitle) || useNewTemplate) {
    // 새 템플릿이면 설정값 사용, 아니면 기본값
    let titleFontPath;
    let hlColor;
    let titleColor;
    let titleFontSize;
    let titleAlign;
    let titleX;
    let titleYRatio;
    
    if (useNewTemplate) {
      // 새 템플릿 설정
      const fontMap = {
        'Pretendard': 'malgunbd',
        'NanumGothic': 'malgunbd',
        'NanumMyeongjo': 'malgunbd',
        'GmarketSans': 'malgunbd',
        'BlackHanSans': 'malgunbd',
        'Jua': 'malgunbd',
        'DoHyeon': 'malgunbd',
      };
      const fontName = fontMap[newTemplate.title?.font] || 'malgunbd';
      titleFontPath = getFontPath('ko', fontName);
      hlColor = newTemplate.title?.highlightColor || '#ffea00';
      titleColor = newTemplate.title?.color || '#ffffff';
      // 🔴 미리보기 270x480 → 실제 1080x1920 (4배)
      // 템플릿 fontSize는 실제 1080x1920 기준으로 저장됨
      // 미리보기에서 fontSize * 0.25로 표시했으니, 실제로는 그대로 사용
      titleFontSize = newTemplate.title?.fontSize || 28;
      titleAlign = newTemplate.title?.align || 'center';
      titleX = newTemplate.title?.x || 50;
      titleYRatio = (newTemplate.title?.y || 8) / 100;
    } else {
      titleFontPath = getFontPath('ko', 'malgunbd');
      hlColor = config.customHighlightColor || '#ffea00';
      titleColor = '#ffffff';
      titleYRatio = (config.templateTitleY !== undefined ? config.templateTitleY : 50) / 100;
      titleAlign = 'center';
      titleX = 50;
    }

    // 줄바꿈으로 나눔
    const titleLines = templateTitle.split('\n').map(l => l.trim()).filter(Boolean);

    // 폰트 사이즈 (새 템플릿이면 직접 지정, 아니면 자동 계산)
    const lineCount = titleLines.length;
    if (!useNewTemplate) {
      const maxFontSize = Math.floor(topBarH * 0.28);
      titleFontSize = lineCount >= 2 ? Math.floor(maxFontSize * 0.85) : maxFontSize;
    }

    // 총 제목 블록 높이 (줄 수 * 폰트 사이즈 * 줄간격)
    const lineHeight = Math.floor(titleFontSize * 1.25);
    const totalBlockH = lineHeight * lineCount;

    // 블록이 상단 띠 안에서 시작하는 Y
    const blockStartY = useNewTemplate 
      ? Math.floor(targetH * titleYRatio)
      : Math.floor((topBarH - totalBlockH) * titleYRatio);

    let prefix = 'ttl';
    titleLines.forEach((line, idx) => {
      const lineY = blockStartY + idx * lineHeight;
      templateLastLabel = drawMultiColorLine(
        templateLastLabel,
        line,
        lineY,
        titleFontSize,
        titleFontPath,
        hlColor,
        `${prefix}${idx}`,
        titleAlign,
        titleX
      );
    });

    // 하단 서브타이틀 (topbottom 템플릿)
    if (template === 'topbottom' && templateSubtitle) {
      const subFontSize = Math.floor(bottomBarH * 0.32);
      const bottomYRatio = (config.templateBottomY !== undefined ? config.templateBottomY : 50) / 100;
      const bottomBlockStart = targetH - bottomBarH + Math.floor((bottomBarH - subFontSize * 1.25) * bottomYRatio);

      templateLastLabel = drawMultiColorLine(
        templateLastLabel,
        templateSubtitle,
        bottomBlockStart,
        subFontSize,
        titleFontPath,
        hlColor,
        'btm'
      );
    }
  }

  // 자막
  let lastLabel = templateLastLabel;
  if (config.useSubtitle !== false && segments && segments.length > 0) {
    const preset = SUBTITLE_PRESETS[config.subtitlePreset] || SUBTITLE_PRESETS.classic;
    // 자막 텍스트 샘플링: 실제 표시될 자막 중 첫 몇 줄을 합쳐서 언어 자동 감지
    const subtitleSample = segments
      .slice(0, 5)
      .map(s => s.text || '')
      .join(' ')
      .slice(0, 200);
    const fontPath = getFontPath(targetLang, config.fontFamily, subtitleSample);

    // 사이즈 프리셋 (S/M/L/XL)
    const sizePreset = SIZE_PRESETS[config.sizePreset] || SIZE_PRESETS.M;
    
    // 템플릿에서 자막 설정 가져오기
    const templateSubtitleSettings = config.template?.subtitle || {};
    const templateSubtitleFontSize = templateSubtitleSettings.fontSize;
    const templateSubtitleY = templateSubtitleSettings.y;

    const style = {
      fontColor: toFFColor(config.customFontColor || preset.fontColor),
      borderColor: toFFColor(config.customBorderColor || preset.borderColor),
      // 우선순위: 템플릿 설정 > 직접 입력 > 사이즈 프리셋 > 스타일 프리셋
      borderWidth: config.customBorderWidth ?? sizePreset.borderWidth ?? preset.borderWidth,
      fontSize: templateSubtitleFontSize ?? config.customFontSize ?? sizePreset.fontSize ?? preset.fontSize,
      bgEnabled: config.customBgEnabled ?? preset.bgEnabled,
      bgColor: config.customBgColor || preset.bgColor || 'black@0.6',
      shadowEnabled: config.customShadowEnabled ?? preset.shadowEnabled,
      animation: config.customAnimation || preset.animation,
      // 🆕 스타일 타입
      styleType: config.subtitleStyleType || 'outline',
      barColor: config.subtitleBarColor || 'black@0.85',
      glowColor: config.subtitleGlowColor || null,
      gradientColors: config.subtitleGradientColors || null,
    };
    
    // 스타일 타입별 설정 조정
    if (style.styleType === 'bar' || style.styleType === 'gradient_bar') {
      style.bgEnabled = true;
      style.bgColor = style.barColor;
      style.borderWidth = 0;
    } else if (style.styleType === 'shadow') {
      style.shadowEnabled = true;
      style.borderWidth = 0;
    } else if (style.styleType === 'minimal') {
      style.borderWidth = 0;
      style.shadowEnabled = false;
    } else if (style.styleType === 'outline_thick') {
      style.borderWidth = 4;
    } else if (style.styleType === 'neon') {
      // 네온 효과는 shadowcolor로 구현
      style.shadowEnabled = true;
      style.glowEnabled = true;
    }

    // 자막 Y축 위치
    // 템플릿 모드면 영상 영역 안쪽으로 자동 제한
    let yPos;
    const hasTemplate = template !== 'off';
    const videoAreaTop = topBarH;
    const videoAreaBottom = targetH - bottomBarH;
    
    // 템플릿 자막 Y 설정이 있으면 우선 사용
    const subtitleYValue = templateSubtitleY ?? config.subtitleY;

    if (subtitleYValue !== undefined && subtitleYValue !== null) {
      // 퍼센트 기반 (0~100)
      const yPercent = Math.max(0, Math.min(100, subtitleYValue));
      if (hasTemplate) {
        // 영상 영역 안에서만 움직이도록
        yPos = `${videoAreaTop}+(${videoAreaBottom - videoAreaTop}-text_h)*${(yPercent / 100).toFixed(3)}`;
      } else {
        yPos = `(h-text_h)*${(yPercent / 100).toFixed(3)}`;
      }
    } else {
      // 프리셋
      const posPreset = config.subtitlePosition || 'bottom';
      if (hasTemplate) {
        // 템플릿 모드: 영상 영역 안쪽
        const areaH = videoAreaBottom - videoAreaTop;
        if (posPreset === 'top-most' || posPreset === 'top') {
          yPos = `${videoAreaTop + Math.floor(areaH * 0.05)}`;
        } else if (posPreset === 'upper') {
          yPos = `${videoAreaTop + Math.floor(areaH * 0.25)}`;
        } else if (posPreset === 'middle') {
          yPos = `${videoAreaTop}+(${areaH}-text_h)/2`;
        } else if (posPreset === 'lower') {
          yPos = `${videoAreaTop + Math.floor(areaH * 0.75)}`;
        } else if (posPreset === 'bottom-most') {
          yPos = `${videoAreaBottom}-text_h-${Math.floor(areaH * 0.03)}`;
        } else {
          // bottom (기본)
          yPos = `${videoAreaBottom}-text_h-${Math.floor(areaH * 0.1)}`;
        }
      } else {
        // 일반 모드: 6단계 위치
        if (posPreset === 'top-most') {
          yPos = isShorts ? 'h*0.05' : 'h*0.04';        // 최상단
        } else if (posPreset === 'top') {
          yPos = isShorts ? 'h*0.15' : 'h*0.1';         // 상단
        } else if (posPreset === 'upper') {
          yPos = isShorts ? 'h*0.35' : 'h*0.3';         // 중상
        } else if (posPreset === 'middle') {
          yPos = '(h-text_h)/2';                          // 중앙
        } else if (posPreset === 'lower') {
          yPos = isShorts ? 'h*0.65' : 'h*0.7';         // 중하
        } else if (posPreset === 'bottom-most') {
          yPos = isShorts ? 'h-text_h-80' : 'h-text_h-40'; // 최하단
        } else {
          yPos = isShorts ? 'h-text_h-300' : 'h-text_h-100'; // bottom (기본)
        }
      }
    }

    // 자막 텍스트를 파일로 저장 (줄바꿈 제대로 인식 + 긴 자막 문제 회피)
    const subFilePaths = [];

    // 언어별 한 줄 최대 글자수 (화면 폭 기준)
    // 쇼츠(9:16)는 폭이 좁아서 짧게, 롱폼(16:9)은 길게 가능
    const wrapMaxByLang = {
      ko: isShorts ? 18 : 28, ja: isShorts ? 18 : 28, zh: isShorts ? 16 : 24,
      en: isShorts ? 24 : 38, es: isShorts ? 24 : 38, fr: isShorts ? 24 : 38,
      de: isShorts ? 22 : 36, it: isShorts ? 24 : 38, pt: isShorts ? 24 : 38,
      ru: isShorts ? 20 : 32, vi: isShorts ? 20 : 32, th: isShorts ? 18 : 28,
    };
    const wrapMax = wrapMaxByLang[targetLang] || 24;

    segments.forEach((seg, idx) => {
      const startT = seg.start.toFixed(3);
      const endT = seg.end.toFixed(3);
      const duration = (seg.end - seg.start).toFixed(3);

      // 자동 줄바꿈 - 화면 폭에 맞게 (영어 등 알파벳 언어에 특히 필요)
      let cleanText = seg.text || '';
      // 폰트가 못 그리는 특수 문자를 ASCII로 변환 (네모 □ 방지)
      cleanText = cleanText
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // 곡선 작은따옴표 → '
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // 곡선 큰따옴표 → "
        .replace(/[\u2013\u2014\u2015]/g, '-')         // en/em dash → -
        .replace(/[\u2026]/g, '...')                    // ellipsis → ...
        .replace(/[\u00A0]/g, ' ')                      // non-breaking space → space
        .replace(/[\u200B-\u200D\uFEFF]/g, '')          // zero-width chars 제거
        .replace(/[\u2028\u2029]/g, ' ')                // line/paragraph separator → space
        .replace(/[\u2022\u25E6\u25CF]/g, '-')          // bullets → -
        .replace(/[\u2032\u2033]/g, "'")                // prime → '
        .replace(/[\u00AB\u00BB]/g, '"')                // french quotes → "
        .trim();

      // 줄 단위로 분할 (drawtext가 여러 줄을 \n으로 못 그리므로 별도 처리)
      const wrappedText = wrapTextInLines(cleanText, wrapMax);
      const lines = wrappedText.split('\n').filter(l => l.trim());
      if (lines.length === 0) return;

      // 강조 세그먼트면 색 다르게 (포인트 자막)
      const segFontColor = seg.highlight
        ? toFFColor(config.customHighlightColor || '#FFEA00') // 기본 노란색
        : style.fontColor;
      const segBorderColor = seg.highlight
        ? toFFColor('#000000')
        : style.borderColor;

      // 줄 높이 계산 (폰트 크기 + line_spacing)
      const lineHeight = Math.floor(style.fontSize * 1.25);
      // 여러 줄일 때 전체 높이의 절반만큼 위로 올림 (중앙 정렬)
      const totalH = lineHeight * lines.length;
      const yOffset = -Math.floor(totalH / 2) + Math.floor(lineHeight / 2);

      lines.forEach((line, lineIdx) => {
        const nextLabel = `sub${idx}_${lineIdx}`;

        // 각 줄을 별도 파일로 저장
        const subFilePath = path.join(jobDir, `sub_${idx}_${lineIdx}.txt`);
        fs.writeFileSync(subFilePath, line, 'utf-8');
        subFilePaths.push(subFilePath);
        const escapedSubPath = subFilePath.replace(/\\/g, '/').replace(/:/g, '\\:');

        let alphaExpr = null;
        let xExpr = '(w-text_w)/2'; // 가로 중앙
        // 이 줄의 y 위치 = 기준 yPos + (이 줄이 전체 중앙에서 얼마나 떨어졌는지)
        const lineYBase = `(${yPos})+(${yOffset + lineIdx * lineHeight})`;
        let yExpr = lineYBase;

        // 애니메이션 종류 (각 줄에 동일 적용)
        switch (style.animation) {
          case 'fade': {
            const fade = 0.2;
            alphaExpr = `if(lt(t,${startT}+${fade}),(t-${startT})/${fade},if(gt(t,${endT}-${fade}),(${endT}-t)/${fade},1))`;
            break;
          }
          case 'slide_up': {
            const slide = 0.3;
            yExpr = `if(lt(t,${startT}+${slide}),(${lineYBase})+(${slide}-(t-${startT}))*100,${lineYBase})`;
            alphaExpr = `if(lt(t,${startT}+${slide}),(t-${startT})/${slide},1)`;
            break;
          }
          case 'slide_left': {
            const slide = 0.3;
            xExpr = `if(lt(t,${startT}+${slide}),(w-text_w)/2+(${slide}-(t-${startT}))*200,(w-text_w)/2)`;
            alphaExpr = `if(lt(t,${startT}+${slide}),(t-${startT})/${slide},1)`;
            break;
          }
          case 'pop': {
            const pop = 0.15;
            alphaExpr = `if(lt(t,${startT}+${pop}),(t-${startT})/${pop},1)`;
            break;
          }
          case 'bounce': {
            const bounce = 0.4;
            yExpr = `if(lt(t,${startT}+${bounce}),(${lineYBase})-abs(sin((t-${startT})*15))*40+(${bounce}-(t-${startT}))*80,${lineYBase})`;
            break;
          }
          case 'typewriter': {
            const tw = Math.min(duration * 0.6, 1.0);
            alphaExpr = `if(lt(t,${startT}+${tw}),(t-${startT})/${tw},1)`;
            break;
          }
          case 'shake': {
            xExpr = `(w-text_w)/2+sin((t-${startT})*30)*5`;
            break;
          }
          case 'zoom_in': {
            const zoom = 0.25;
            alphaExpr = `if(lt(t,${startT}+${zoom}),(t-${startT})/${zoom},1)`;
            break;
          }
          default:
            break;
        }

        const opts = [
          `fontfile='${fontPath}'`,
          `textfile='${escapedSubPath}'`,
          `fontcolor=${segFontColor}`,
          `fontsize=${style.fontSize}`,
          `bordercolor=${segBorderColor}`,
          `borderw=${style.borderWidth}`,
          `x=${xExpr}`,
          `y=${yExpr}`,
          `enable='between(t,${startT},${endT})'`,
        ];

        if (style.bgEnabled) {
          opts.push('box=1', `boxcolor=${style.bgColor}`, 'boxborderw=20');
        }
        if (style.glowEnabled && style.glowColor) {
          // 네온 효과: 글로우 색상으로 그림자
          const glowHex = style.glowColor.replace('#', '');
          opts.push(`shadowcolor=0x${glowHex}@0.8`, 'shadowx=0', 'shadowy=0');
        } else if (style.shadowEnabled) {
          opts.push('shadowcolor=black@0.6', 'shadowx=3', 'shadowy=3');
        }
        if (alphaExpr) {
          opts.push(`alpha='${alphaExpr}'`);
        }

        filters.push(`[${lastLabel}]drawtext=${opts.join(':')}[${nextLabel}]`);
        lastLabel = nextLabel;
      });
    });
  }

  // 워터마크 - 위치/불투명도/애니메이션/크기 옵션 지원
  if (config.useWatermark !== false) {
    const wmFontPath = getFontPath('ko');
    const watermarkText = escapeDrawtext(config.channelName || '제일라 쇼츠리믹스');

    // 옵션 값 (기본값 포함)
    const wmPosition = config.watermarkPosition || 'animated'; // animated | top-left | top-right | bottom-left | bottom-right
    const wmOpacity = typeof config.watermarkOpacity === 'number' ? config.watermarkOpacity : 0.35;
    const wmFontSize = config.watermarkFontSize || 48;
    const wmAlphaStr = wmOpacity.toFixed(2);
    const wmBorderAlpha = Math.min(wmOpacity * 0.85, 1).toFixed(2);

    // 위치 계산
    let wmX, wmY;
    const margin = 30;
    switch (wmPosition) {
      case 'top-left':
        wmX = `${margin}`;
        wmY = `${margin}`;
        break;
      case 'top-right':
        wmX = `w-text_w-${margin}`;
        wmY = `${margin}`;
        break;
      case 'bottom-left':
        wmX = `${margin}`;
        wmY = `h-text_h-${margin}`;
        break;
      case 'bottom-right':
        wmX = `w-text_w-${margin}`;
        wmY = `h-text_h-${margin}`;
        break;
      case 'animated':
      default:
        // 부드럽게 떠다니는 움직임
        wmX = `(w-text_w)/2 + sin(t*0.4)*w*0.15`;
        wmY = `h*0.15 + cos(t*0.3)*h*0.08`;
        break;
    }

    filters.push(`[${lastLabel}]drawtext=fontfile='${wmFontPath}':text='${watermarkText}':fontcolor=white@${wmAlphaStr}:fontsize=${wmFontSize}:bordercolor=black@${wmBorderAlpha}:borderw=2:x=${wmX}:y=${wmY}[final]`);
  } else {
    filters.push(`[${lastLabel}]null[final]`);
  }

  const filterComplex = filters.join(';');

  // 필터 스크립트를 파일로 저장 (명령어 길이 제한 회피)
  const filterScriptPath = outputPath.replace(/\.mp4$/, '.filter.txt');
  fs.writeFileSync(filterScriptPath, filterComplex, 'utf-8');

  // 🔴 영상 길이 유지: 원본 영상 길이에 맞춰서 출력
  // 드라마/제품 모드에선 TTS를 영상 전체에 분산 배치했으므로 apad 불필요
  // 만약 오디오가 짧으면 apad로 끝까지 채움 (안전망)
  const videoDuration = await getMediaDuration(videoPath);
  
  // 🆕 TTS 길이 확인: TTS가 영상보다 길면 영상 연장 (마지막 말 잘림 방지!)
  let finalDuration = videoDuration;
  if (ttsPath) {
    try {
      const ttsDuration = await getMediaDuration(ttsPath);
      if (ttsDuration > videoDuration + 0.3) {
        // TTS가 영상보다 0.3초 이상 길면 → 영상 끝에서 TTS 끝까지 연장
        finalDuration = ttsDuration + 0.2; // 0.2초 여유 (완전히 끝나고 1~2프레임 남김)
        console.log(`[compose] 🎯 TTS(${ttsDuration.toFixed(2)}s) > 영상(${videoDuration.toFixed(2)}s) → 영상 ${finalDuration.toFixed(2)}초까지 연장 (마지막 말 잘림 방지)`);
      }
    } catch (e) {
      console.warn('[compose] TTS 길이 측정 실패:', e.message);
    }
  }

  const ffmpegArgs = ['-y', '-i', videoPath];
  if (ttsPath) {
    ffmpegArgs.push('-i', ttsPath);
  }

  // 🎬 예능 썰 하이브리드 모드: 원본 음성 + TTS 믹싱
  const useHybridAudio = ttsPath && config.mixOriginalAudio === 'hybrid';

  if (useHybridAudio) {
    // 비디오 필터 + 오디오 믹스를 한 스크립트에 통합
    // 원본 음성(0:a) 35% 볼륨 + TTS(1:a) 100% 볼륨 → amix
    const audioMix = '[0:a]volume=0.35[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0[aout]';
    const combinedFilter = filterComplex + ';' + audioMix;
    fs.writeFileSync(filterScriptPath, combinedFilter, 'utf-8');

    ffmpegArgs.push(
      '-filter_complex_script', filterScriptPath,
      '-map', '[final]',
      '-map', '[aout]',
      // 🆕 고화질 설정: preset medium (품질↑) + crf 18 (거의 무손실)
      // + 비트레이트 명시 (8Mbps) = 인스타/틱톡 쇼츠 권장 고화질
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-b:v', '8M', '-maxrate', '10M', '-bufsize', '16M',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0',
      '-c:a', 'aac', '-b:a', '320k',  // 오디오도 320k로 업 (192k → 320k)
      '-t', finalDuration.toFixed(3),
      outputPath
    );
  } else {
    ffmpegArgs.push(
      '-filter_complex_script', filterScriptPath,
      '-map', '[final]',
      '-map', ttsPath ? '1:a' : '0:a',
      // 🆕 고화질 설정
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-b:v', '8M', '-maxrate', '10M', '-bufsize', '16M',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0',
      '-c:a', 'aac', '-b:a', '320k',
      '-t', finalDuration.toFixed(3),
      '-af', 'apad',
      outputPath
    );
  }

  try {
    await runCommand(ffmpeg, ffmpegArgs, (text) => {
      if (text.match(/time=(\d+):(\d+):(\d+\.\d+)/)) {
        onProgress('compose', 85, '영상 합성 중...');
      }
    });
  } finally {
    try { fs.unlinkSync(filterScriptPath); } catch (e) {}
  }

  return outputPath;
}

// ===== 쿠팡 링크 =====
// ===== Vision LLM: 영상 프레임에서 제품 인식 =====
// Gemini/Claude/GPT Vision을 사용해서 영상 속 제품을 직접 눈으로 파악
async function extractProductFromFrames(videoPath, videoDuration, config, onProgress) {
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const jobDir = path.dirname(videoPath);

  // 1) 프레임 3장 추출 (25%, 50%, 75% 시점)
  const framePaths = [];
  const timePoints = [0.1, 0.3, 0.5, 0.7, 0.9];

  for (let i = 0; i < timePoints.length; i++) {
    const seekTime = videoDuration * timePoints[i];
    const framePath = path.join(jobDir, `vision_frame_${i}.jpg`);
    try {
      await runCommand(ffmpeg, [
        '-y',
        '-ss', seekTime.toFixed(2),
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', '5', // 품질 (2=최고, 31=최저, 5는 적당히 좋음)
        '-vf', 'scale=720:-1', // 720px 너비로 축소 (API 전송 빠르게)
        framePath,
      ]);
      if (fs.existsSync(framePath)) {
        framePaths.push(framePath);
      }
    } catch (e) {
      console.error(`프레임 ${i} 추출 실패:`, e.message);
    }
  }

  if (framePaths.length === 0) {
    console.warn('Vision: 프레임 추출 실패');
    return null;
  }

  // 2) 이미지를 base64로 인코딩
  const images = framePaths.map(p => {
    const data = fs.readFileSync(p).toString('base64');
    return { path: p, base64: data };
  });

  // 3) Gemini Vision 우선 시도 (무료, 빠름)
  const visionPrompt = `다음은 한 영상에서 추출한 3개의 프레임입니다. 이 영상에서 판매/홍보되는 제품이 있는지 분석해주세요.

**분석 규칙:**
1. 영상에 **명확하게 보이는 제품** (사람이 사용하거나, 화면 중앙에 등장하거나, 반복적으로 보이는 것)을 찾아주세요.
2. 제품명은 **쿠팡에서 검색 가능한 2~4단어**로 (예: "무선 청소기", "접이식 의자", "블루투스 이어폰")
3. 브랜드명이 명확하면 포함 (예: "나이키 에어포스", "다이슨 청소기")
4. 제품이 **여러 개 보여도 가장 핵심적인 것 하나만**
5. 제품이 명확하지 않으면 (사람만 나오거나, 풍경만 보이면) confident=false로

**출력 형식 (JSON만, 다른 텍스트 금지):**
{
  "main": "제품명 (2~4단어)",
  "confident": true/false,
  "description": "영상에서 본 내용 간단 설명 (한 문장)",
  "suggestions": ["추천1", "추천2", "추천3"]
}

**예시 1 (명확한 제품):**
{
  "main": "접이식 수영장",
  "confident": true,
  "description": "파란색 접이식 대형 수영장을 시연하는 영상",
  "suggestions": []
}

**예시 2 (불명확):**
{
  "main": "여름 아이템",
  "confident": false,
  "description": "더위 관련 콘텐츠지만 특정 제품 확인 어려움",
  "suggestions": ["탁상용 선풍기", "쿨매트", "아이스 조끼"]
}

JSON만 출력하세요:`;

  // Gemini Vision 시도
  if (config.geminiApiKey) {
    try {
      onProgress?.('compose', 88, '영상 분석 중 (Gemini Vision)...');
      const result = await callGeminiVision(visionPrompt, images, config.geminiApiKey);
      if (result) {
        console.log('[Vision] Gemini 성공:', result.main);
        return result;
      }
    } catch (e) {
      console.error('[Vision] Gemini 실패:', e.message);
    }
  }

  // Claude Vision 시도
  if (config.anthropicApiKey) {
    try {
      onProgress?.('compose', 88, '영상 분석 중 (Claude Vision)...');
      const result = await callClaudeVision(visionPrompt, images, config.anthropicApiKey);
      if (result) {
        console.log('[Vision] Claude 성공:', result.main);
        return result;
      }
    } catch (e) {
      console.error('[Vision] Claude 실패:', e.message);
    }
  }

  // OpenAI Vision 시도
  if (config.openaiApiKey) {
    try {
      onProgress?.('compose', 88, '영상 분석 중 (GPT Vision)...');
      const result = await callOpenAIVision(visionPrompt, images, config.openaiApiKey);
      if (result) {
        console.log('[Vision] OpenAI 성공:', result.main);
        return result;
      }
    } catch (e) {
      console.error('[Vision] OpenAI 실패:', e.message);
    }
  }

  // 정리
  framePaths.forEach(p => {
    try { fs.unlinkSync(p); } catch (e) {}
  });

  console.warn('[Vision] 모든 provider 실패, 텍스트 방식으로 폴백');
  return null;
}

// Gemini Vision API 호출
async function callGeminiVision(prompt, images, apiKey) {
  const model = 'gemini-2.0-flash-exp';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: img.base64,
      },
    });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 500,
    },
  };

  const response = await axios.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  return parseVisionResponse(text);
}

// Claude Vision API 호출
async function callClaudeVision(prompt, images, apiKey) {
  const content = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: img.base64,
      },
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 30000,
    }
  );

  const text = response.data?.content?.[0]?.text;
  if (!text) return null;

  return parseVisionResponse(text);
}

// OpenAI Vision API 호출
async function callOpenAIVision(prompt, images, apiKey) {
  const content = [{ type: 'text', text: prompt }];
  for (const img of images) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${img.base64}` },
    });
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) return null;

  return parseVisionResponse(text);
}

// Vision 응답 파싱 (공통)
function parseVisionResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.main) return null;

    // main 정리
    let main = String(parsed.main)
      .replace(/['"""『』「」\[\](){}]/g, '')
      .replace(/[,，、·]/g, ' ')
      .trim();

    const words = main.split(/\s+/).filter(Boolean);
    if (words.length > 4) main = words.slice(0, 4).join(' ');

    return {
      main: main || '추천 상품',
      confident: parsed.confident === true,
      description: parsed.description || '',
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .filter(s => typeof s === 'string' && s.length > 0)
            .slice(0, 3)
        : [],
    };
  } catch (e) {
    console.error('Vision 응답 파싱 실패:', e.message);
    return null;
  }
}

function generateCoupangLink(keyword, partnerCode) {
  const encoded = encodeURIComponent(keyword);
  // 🔧 가짜 단축 링크 만들지 말고 진짜 쿠팡 검색 페이지 URL 사용
  // partnerCode는 deeplink API로 추후 변환 시 사용 (여기서는 단순 검색 링크만)
  return `https://www.coupang.com/np/search?q=${encoded}&channel=user`;
}

async function extractKeyword(text, config) {
  try {
    const result = await callLLM(
      [{
        role: 'user',
        content: `다음 영상 스크립트를 분석해서 쿠팡에서 검색할 수 있는 제품명을 JSON으로 추출하세요.

**규칙 (매우 중요):**
1. 🔴 영상에서 **실제로 언급되는 구체적인 제품** 딱 **하나**만 "main" 에 넣으세요.
2. 🔴 여러 키워드 섞지 마세요. "블루투스 이어폰 무선 충전" ❌ → "블루투스 이어폰" ✅
3. 🔴 형용사/수식어 금지: "최고의", "인기", "추천", "베스트" 같은 말 빼세요
4. 🔴 카테고리가 아니라 **구매 가능한 실제 물건**이어야 함
5. ✅ 좋은 예: "접이식 수영장", "무선 청소기", "캠핑 의자", "탁상용 선풍기"
6. ❌ 나쁜 예: "여름용품", "가전제품", "아이디어 상품" (너무 광범위)

**추가 규칙:**
- 제품이 **명확하지 않을 때** → "suggestions" 배열에 관련 제품 추천 3개 제공
- 제품이 **명확할 때** → "suggestions"는 빈 배열 []

**출력 형식 (JSON만):**
{
  "main": "제품명 (2~4단어)",
  "confident": true/false,
  "suggestions": ["추천1", "추천2", "추천3"]
}

**예시 1 (제품 명확):**
스크립트: "This foldable pool is 2.4m x 1.5m and folds into a small box"
출력:
{
  "main": "접이식 수영장",
  "confident": true,
  "suggestions": []
}

**예시 2 (제품 불명확):**
스크립트: "여름에 시원하게 보내는 법에 대해 이야기해볼게요"
출력:
{
  "main": "여름 아이템",
  "confident": false,
  "suggestions": ["탁상용 선풍기", "쿨매트", "아이스팩"]
}

**스크립트:**
${text.substring(0, 1500)}

**JSON 출력 (다른 텍스트 절대 금지):**`,
      }],
      config,
      2
    );

    // JSON 파싱
    let parsed = null;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('쿠팡 키워드 JSON 파싱 실패:', e.message);
    }

    if (parsed && parsed.main) {
      // main 정리
      let main = String(parsed.main)
        .replace(/['"""『』「」\[\](){}]/g, '')
        .replace(/[,，、·]/g, ' ')
        .replace(/^[-•*\d\.\s]+/, '')
        .trim();

      const words = main.split(/\s+/).filter(Boolean);
      if (words.length > 4) main = words.slice(0, 4).join(' ');

      return {
        main: main || '추천 상품',
        confident: parsed.confident === true,
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter(s => typeof s === 'string' && s.length > 0).slice(0, 3)
          : [],
      };
    }

    // 파싱 실패 - 구 방식으로 폴백 (텍스트 첫 줄)
    let keyword = result
      .split('\n')[0]
      .replace(/['"""『』「」\[\](){}]/g, '')
      .replace(/[,，、·]/g, ' ')
      .replace(/^[-•*\d\.\s]+/, '')
      .replace(/^(상품명|키워드|검색어|답|정답|main)[:\s]*/i, '')
      .trim();

    const words = keyword.split(/\s+/).filter(Boolean);
    if (words.length > 4) keyword = words.slice(0, 4).join(' ');

    return {
      main: keyword || '추천 상품',
      confident: false,
      suggestions: [],
    };
  } catch (e) {
    return {
      main: '추천 상품',
      confident: false,
      suggestions: [],
    };
  }
}

// ===== 메인 처리 =====
async function processVideo({ url, config, workDir, jobId, onProgress }) {
  // 🆕 이 job의 모든 runCommand 호출이 자동으로 jobId 추적하도록 (취소 시 kill 가능)
  global.__currentProcessorJobId = jobId;
  
  const jobDir = path.join(workDir, `job_${jobId}`);
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  const originalPath = path.join(jobDir, 'original.mp4');
  const audioPath = path.join(jobDir, 'audio.mp3');
  const ttsPath = path.join(jobDir, 'tts.mp3');
  const outputPath = path.join(workDir, `output_${jobId}.mp4`);

  const sourceLang = config.sourceLang || 'auto';
  const targetLang = config.targetLang || 'ko';
  const mode = config.mode || 'natural';

  // 대상 언어 TTS 음성 자동 매칭
  let ttsVoice = LANGUAGES[targetLang]?.voice || 'ko-KR-SunHiNeural';
  // 사용자가 같은 언어 다른 보이스 골랐으면 그거 사용
  const langPrefix = (targetLang + '-').toLowerCase();
  if (config.ttsVoice && config.ttsVoice.toLowerCase().startsWith(langPrefix)) {
    ttsVoice = config.ttsVoice;
  }

  // 1. 다운로드 (또는 미리 합쳐진 영상 사용)
  if (config.__preMergedVideoPath && fs.existsSync(config.__preMergedVideoPath)) {
    // 🔴 multi-source: 이미 합쳐진 영상 사용
    console.log('[main] 합쳐진 영상 사용:', config.__preMergedVideoPath);
    fs.copyFileSync(config.__preMergedVideoPath, originalPath);
    onProgress('download', 10, '여러 영상 합치기 완료');
  } else {
    await downloadVideo(url, originalPath, onProgress);
  }

  // 1-1. 영상 자르기 (앞/뒤 N초) - 옵션
  const trimStartSec = parseFloat(config.trimStart) || 0;
  const trimEndSec = parseFloat(config.trimEnd) || 0;
  if (trimStartSec > 0 || trimEndSec > 0) {
    onProgress('download', 12, `영상 자르기 (앞 ${trimStartSec}초 / 뒤 ${trimEndSec}초)...`);
    const fullDur = await getMediaDuration(originalPath);
    const newStart = trimStartSec;
    const newEnd = Math.max(newStart + 1, fullDur - trimEndSec);
    const newDur = newEnd - newStart;
    if (newDur > 0 && newDur < fullDur) {
      const trimmedPath = path.join(jobDir, 'original_trimmed.mp4');
      const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
      try {
        await runCommand(ffmpeg, [
          '-y',
          '-ss', newStart.toString(),
          '-i', originalPath,
          '-t', newDur.toString(),
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          trimmedPath,
        ]);
        // 원본 교체
        fs.unlinkSync(originalPath);
        fs.renameSync(trimmedPath, originalPath);
      } catch (e) {
        console.warn('영상 자르기 실패, 원본 사용:', e.message);
      }
    }
  }

  // 2. 오디오 추출
  await extractAudio(originalPath, audioPath, onProgress, config);

  // 오디오 없으면 사용자에게 확인
  if (config.__noAudio) {
    onProgress('audio', 25, '⚠️ 오디오 없음 - 확인 필요');
    // IPC를 통해 사용자에게 확인 (main.js에서 처리)
    if (config.__askNoAudio) {
      const userChoice = await config.__askNoAudio();
      if (userChoice === 'cancel') {
        throw new Error('사용자가 취소했습니다. (오디오 없는 영상)');
      }
    }
    // AI 더빙으로 진행
    config.__forceAIDub = true;
    onProgress('audio', 28, 'AI 더빙으로 진행합니다...');
  }

  // 영상 길이 측정 (제품 모드에서 필요)
  // 🔴 수동 컷 시 갱신될 수 있어서 let
  let videoDuration = await getMediaDuration(originalPath);
  console.log(`[processor] 실제 영상 길이: ${videoDuration.toFixed(2)}초`);

  // 3. STT 또는 AI 대본 생성
  let transcription = { segments: [], text: '', language: targetLang };
  let detectedLang = targetLang;
  
  if (config.__forceAIDub) {
    // 오디오 없음 → AI가 영상 분석해서 대본 생성
    onProgress('stt', 30, '🤖 AI가 영상 분석 중...');
    
    const aiScript = await generateScriptForMuteVideo(originalPath, videoDuration, config, onProgress);
    
    // AI 생성 대본을 segments 형태로 변환
    transcription = {
      segments: aiScript.segments,
      text: aiScript.fullText,
      language: targetLang,
    };
    detectedLang = targetLang;
    
    onProgress('stt', 40, '✅ AI 대본 생성 완료');
  } else {
    // 정상 오디오 → STT
    if (!config.groqApiKey) {
      throw new Error('STT(음성 인식)는 Groq Whisper를 사용합니다. 설정 탭에서 Groq API 키를 입력해주세요. (무료)');
    }
    transcription = await transcribeAudio(audioPath, sourceLang, config.groqApiKey, onProgress);
    detectedLang = transcription.language;
  }

  // 4. 영상 타입에 따라 분기
  const videoType = config.videoType || 'talking';
  let translatedSegments = [];
  let fullTranslation = '';
  let adCopy = null;
  let highlightKeywords = null;

  // 🔴 디버그: 분기 확인
  console.log(`[processor] ========================================`);
  console.log(`[processor] videoType: ${videoType}`);
  console.log(`[processor] talkingScript: ${config.talkingScript ? config.talkingScript.substring(0, 50) + '...' : 'NULL'}`);
  console.log(`[processor] transcription.segments: ${transcription.segments ? transcription.segments.length + '개' : 'NULL'}`);
  console.log(`[processor] ========================================`);

  if (videoType === 'product') {
    // ===== 제품 모드 =====
    // 광고 카피 재작성 → 문장별 TTS → 자막은 카피 그대로

    // 🔴 수동 컷 모드: 사용자가 지정한 구간만 사용
    if (config.productCutMode === 'manual' && config.productCutRanges && config.productCutRanges.length > 0) {
      onProgress('translate', 38, '✂️ 사용자 지정 구간 추출 중...');

      // 유효성 검사 + 정렬
      const validRanges = config.productCutRanges
        .map(r => ({ start: parseFloat(r.start), end: parseFloat(r.end) }))
        .filter(r => !isNaN(r.start) && !isNaN(r.end) && r.start < r.end && r.start < videoDuration)
        .map(r => ({
          start: Math.max(0, r.start),
          end: Math.min(videoDuration, r.end),
        }))
        .sort((a, b) => a.start - b.start);

      if (validRanges.length === 0) {
        throw new Error('수동 컷 구간이 모두 유효하지 않습니다. 구간을 다시 입력해주세요.');
      }

      console.log(`[product-manual] 사용자 지정 ${validRanges.length}개 구간 추출:`);
      validRanges.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.start.toFixed(1)}~${r.end.toFixed(1)}s (${(r.end - r.start).toFixed(1)}초)`);
      });

      // ffmpeg로 구간 추출 + concat (buildReactionClip 함수 재사용)
      const cutVideoPath = await buildReactionClip(originalPath, validRanges, jobDir, onProgress);
      config.__reactionVideoPath = cutVideoPath; // 합성 단계에서 이 영상 사용
      const newDuration = await getMediaDuration(cutVideoPath);
      console.log(`[product-manual] 추출 영상 길이: ${newDuration.toFixed(1)}초 (원본 ${videoDuration.toFixed(1)}초)`);
      // 비디오 길이 갱신 (광고 카피 길이 제한에 사용)
      videoDuration = newDuration;
    }

    const originalFullText = transcription.segments && transcription.segments.length > 0
      ? transcription.segments.map(s => s.text).join(' ')
      : transcription.text;

    // 🔴 목표 영상 길이 직접 지정 시 (자동 컷이 아니면)
    // 수동 컷은 이미 영상이 잘린 상태라 무시. 자동 컷일 때만 의미 있음
    if (config.productCutMode === 'auto' && config.productTargetLen && config.productTargetLen > 0) {
      const targetLen = config.productTargetLen;
      if (targetLen < videoDuration - 2) {
        // 영상이 더 길면 → 앞부분만 잘라서 사용
        console.log(`[product] 목표 길이 ${targetLen}초로 영상 자르기 (원본 ${videoDuration.toFixed(1)}초)`);
        try {
          const trimmed = await buildReactionClip(
            originalPath,
            [{ start: 0, end: targetLen }],
            jobDir,
            onProgress
          );
          config.__reactionVideoPath = trimmed;
          videoDuration = await getMediaDuration(trimmed);
        } catch (e) {
          console.warn('[product] 목표 길이 자르기 실패 (원본 사용):', e.message);
        }
      }
    }

    // 🔴 대본 처리 방식 분기
    const scriptMode = config.productScriptMode || 'reference';
    const userScript = (config.productAdText || '').trim();

    // (1) 그대로 모드: 사용자 대본을 그대로 사용 (AI 카피 생성 스킵)
    if (scriptMode === 'strict' && userScript.length > 0) {
      console.log('[product] 🔒 대본 그대로 모드: AI 수정 없이 사용자 입력 사용');
      adCopy = userScript;
      
      // 🔴 마무리 멘트 추가 (strict 모드에서도)
      console.log(`[product] 마무리 멘트 체크 (strict): outroText="${config.outroText}"`);
      if (config.outroText && config.outroText.trim()) {
        const outroLines = config.outroText.trim().split('\n').filter(l => l.trim());
        if (outroLines.length > 0) {
          console.log(`[product] ✅ 마무리 멘트 추가 (strict): ${outroLines.length}줄 - "${outroLines.join(' / ')}"`);
          adCopy = adCopy + '\n' + outroLines.join('\n');
        }
      } else {
        console.log('[product] ❌ 마무리 멘트 없음 (strict)');
      }
      
      // 🔴 마침표 제거 후처리 (마침표 → 느낌표 또는 제거)
      adCopy = adCopy.replace(/。/g, '!').replace(/\.(?!\d)/g, '!').replace(/!+/g, '!');
      
      fullTranslation = adCopy;
      console.log(`[product] 최종 대본 (strict): ${adCopy.length}자`);

      // 4-2. 세그먼트 변환 (줄바꿈 = 호흡 단위, / = 자막 단위)
      // TTS는 줄바꿈 단위로 읽고, 자막은 /로 분리
      const breathLines = adCopy.split('\n').map(l => l.trim()).filter(Boolean);
      translatedSegments = [];
      breathLines.forEach((breathLine, breathIdx) => {
        // 각 호흡 라인 안에서 /로 자막 분리
        const subtitleParts = breathLine.split('/').map(s => s.trim()).filter(Boolean);
        subtitleParts.forEach((sub, subIdx) => {
          translatedSegments.push({
            start: breathIdx + subIdx * 0.01,
            end: breathIdx + subIdx * 0.01 + 0.99,
            text: sub,
            breathGroup: breathIdx, // 같은 호흡 그룹 표시
          });
        });
      });
      // generateAdCopy는 호출하지 않음
    } else {
      // (2) 참고 모드 또는 (3) 무시 모드: AI에 전달하는 텍스트만 다르게
      let combinedText = originalFullText;

      // 🔴 원본 텍스트가 너무 짧거나 없으면 경고 + 대본 필수 안내
      const isOriginalEmpty = !originalFullText || originalFullText.trim().length < 20;
      
      if (scriptMode === 'reference' && userScript.length > 0) {
        // 참고: 사용자 대본 우선, 원본도 참고
        combinedText = `[🔴 최우선: 사용자가 입력한 대본 - 이 내용을 기반으로 카피 작성]
${userScript}

[참고: 영상 원본 자막]
${originalFullText || '(원본 음성 없음)'}`;
        console.log(`[product] 📝 참고 모드: 사용자 대본 우선 반영`);
      } else if (scriptMode === 'ignore') {
        // 무시: 사용자 대본 무시, 영상만 보고 생성
        combinedText = originalFullText;
        console.log('[product] 🚫 무시 모드: 사용자 대본 무시 (영상만 분석)');
      } else if (userScript.length > 0) {
        // scriptMode가 reference인데 userScript 있으면 위 분기에서 처리됨
        // 여기는 fallback (scriptMode 없거나 알 수 없을 때)
        combinedText = `[🔴 사용자 입력 대본 - 우선 반영]\n${userScript}\n\n[원본]\n${originalFullText || '(원본 음성 없음)'}`;
      } else if (isOriginalEmpty) {
        // 🔴 원본도 없고 사용자 대본도 없으면 Vision 결과 활용
        console.warn('[product] ⚠️ 원본 음성 없음 + 사용자 대본 없음 → Vision 결과만 사용');
        combinedText = `[⚠️ 영상에 음성이 없습니다. 아래 Vision 분석 결과만 참고하세요]
영상 분석 결과: ${config.__visionDescription || '제품 정보 불명'}

🔴 주의: 구체적인 제품 정보가 없으므로, 일반적인 제품 소개 톤으로 작성하세요.
🔴 캠핑, 여행 등 무관한 시나리오 추가 금지!`;
      }

      // 4-1. 광고 카피 생성
      adCopy = await generateAdCopy(combinedText, videoDuration, targetLang, config, onProgress);

      // 🆕 대본 편집 콜백이 있으면 사용자 확정 대기
      if (config.__waitForScriptConfirm && typeof config.__waitForScriptConfirm === 'function') {
        onProgress('script', 45, '📝 대본 편집 대기 중... 수정 후 확정해주세요!');
        console.log('[product] 🖊️ 대본 편집 대기 중...');
        
        const confirmedScript = await config.__waitForScriptConfirm(adCopy, combinedText);
        
        if (confirmedScript && confirmedScript.trim()) {
          console.log(`[product] ✅ 사용자 확정 대본 수신: ${confirmedScript.length}자`);
          adCopy = confirmedScript.trim();
        } else {
          console.log('[product] ⚠️ 사용자가 대본 수정 없이 확정');
        }
      }

    // 🔴 길이 안전장치
    const cpsForCheck = getCharsPerSecond(targetLang);
    const maxSafeChars = Math.floor(videoDuration * cpsForCheck * 1.2);
    const minSafeChars = Math.floor(videoDuration * cpsForCheck * 0.85); // 영상의 85% 이상 채워야 함

    // (A) 너무 길면 뒤를 잘라냄
    if (adCopy.length > maxSafeChars) {
      console.warn(`[product] 카피 길이 초과 (${adCopy.length}자 > 한계 ${maxSafeChars}자). 뒷부분 잘라냄.`);
      const linesArr = adCopy.split('\n').filter(l => l.trim());
      const truncated = [];
      let charCount = 0;
      for (const line of linesArr) {
        if (charCount + line.length > maxSafeChars) break;
        truncated.push(line);
        charCount += line.length;
      }
      adCopy = truncated.join('\n');
      console.log(`[product] 잘라낸 결과: ${adCopy.length}자, ${truncated.length}줄`);
    }

    // (B) 🔴 너무 짧으면 LLM에 추가 생성 요청 (영상 길이 채우기)
    if (adCopy.length < minSafeChars) {
      const shortage = minSafeChars - adCopy.length;
      const targetExtraChars = Math.floor((maxSafeChars - adCopy.length) * 0.8); // 여유 있게
      console.warn(`[product] 카피 길이 부족 (${adCopy.length}자 < 최소 ${minSafeChars}자). ${targetExtraChars}자 추가 생성 요청.`);
      onProgress('translate', 56, '✍️ 영상 길이 맞춰 카피 추가 중...');

      try {
        const extendPrompt = targetLang === 'ko' ? `다음은 쇼츠 광고 카피입니다. 영상 길이가 남아서 추가 카피가 필요합니다.

**기존 카피:**
${adCopy}

**작업:**
- 위 카피의 끝 부분에 자연스럽게 이어지는 추가 카피 약 ${targetExtraChars}자 작성
- 같은 톤 유지 (친구한테 추천하는 듯한 느낌)
- 사용 후기, 추가 장점, 비교, 팁, CTA 등으로 자연스럽게 채움
- 중간중간 감정 표현/추임새 추가
- 광고가 더 풍성해지도록 (중복 X)

**출력:**
- 한 문장씩 줄바꿈. 한 줄에 20~30자 정도.
- 마침표(.) 금지! 느낌표(!)나 물결(~)로 끝내기
- 라벨/번호/마크다운 금지.` : `Extend this shorts ad copy with about ${targetExtraChars} more characters.

**Existing:**
${adCopy}

Continue naturally in the same tone. One sentence per line. No labels.`;

        const extra = await callLLM([{ role: 'user', content: extendPrompt }], config);
        const extraCleaned = extra
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('**') && !l.startsWith('##') && !l.startsWith('━'))
          .map(l => l.replace(/^[-•*\d\.]+\s*/, ''))
          .join('\n');

        if (extraCleaned && extraCleaned.length > 10) {
          adCopy = adCopy + '\n' + extraCleaned;
          console.log(`[product] 추가 카피 합쳐짐: 총 ${adCopy.length}자`);

          // 추가했는데도 maxSafe 초과하면 다시 잘라냄
          if (adCopy.length > maxSafeChars) {
            const linesArr = adCopy.split('\n').filter(l => l.trim());
            const truncated = [];
            let cc = 0;
            for (const line of linesArr) {
              if (cc + line.length > maxSafeChars) break;
              truncated.push(line);
              cc += line.length;
            }
            adCopy = truncated.join('\n');
          }
        }
      } catch (e) {
        console.warn('[product] 카피 추가 생성 실패 (무시):', e.message);
      }
    }

    // 🔴 마무리 멘트 추가 (outroText가 있으면)
    console.log(`[product] 마무리 멘트 체크 (reference): outroText="${config.outroText}"`);
    if (config.outroText && config.outroText.trim()) {
      const outroLines = config.outroText.trim().split('\n').filter(l => l.trim());
      if (outroLines.length > 0) {
        console.log(`[product] ✅ 마무리 멘트 추가: ${outroLines.length}줄 - "${outroLines.join(' / ')}"`);
        adCopy = adCopy + '\n' + outroLines.join('\n');
      }
    } else {
      console.log('[product] ❌ 마무리 멘트 없음 (reference)');
    }

    // 🔴 마침표 제거 후처리 (마침표 → 느낌표 또는 제거)
    adCopy = adCopy.replace(/。/g, '!').replace(/\.(?!\d)/g, '!').replace(/!+/g, '!');
    
    // 🔴 외국어 제거 (영어, 아랍어, 중국어 등)
    // 아랍어 범위: \u0600-\u06FF
    // 중국어 범위: \u4E00-\u9FFF (한자)
    // 일본어 히라가나/카타카나: \u3040-\u30FF
    adCopy = adCopy.replace(/[\u0600-\u06FF]/g, ''); // 아랍어 제거
    adCopy = adCopy.replace(/[\u4E00-\u9FFF]/g, ''); // 한자 제거
    adCopy = adCopy.replace(/[\u3040-\u30FF]/g, ''); // 일본어 제거
    adCopy = adCopy.replace(/[a-zA-Z]+/g, ''); // 영어 제거
    
    // 빈 줄 정리
    adCopy = adCopy.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    
    fullTranslation = adCopy;
    console.log(`[product] 최종 대본 (reference): ${adCopy.length}자`);

      // 4-2. 세그먼트 변환
      // 🆕 스마트 호흡: 문장 끝 여부로 호흡 결정
      // - 문장 끝 (., !, ?, ~, 다, 임, 요, 네, 지, 어 등) → 새 호흡 (쉼 있음)
      // - 문장 안 끝남 (조사/어미 연결 중) → 같은 호흡 (이어짐, 쉼 없음)
      // - "/" = 자막만 분리 (항상 같은 호흡)
      const breathLines = adCopy.split('\n').map(l => l.trim()).filter(Boolean);
      translatedSegments = [];
      
      // 🆕 문장 끝 판별 함수
      // 문장 종결 어미/부호 확인
      const isSentenceEnd = (text) => {
        if (!text) return false;
        const trimmed = text.trim();
        // 1) 명확한 문장 종결 부호
        if (/[.!?~。！？]$/.test(trimmed)) return true;
        // 2) 한국어 종결 어미 (종결형으로 끝나는 경우)
        //    "~다", "~임", "~음", "~요", "~네", "~지", "~야", "~아", "~어",
        //    "~니", "~자", "~래", "~대", "~죠", "~군", "~걸"
        //    🆕 "음" 추가: "있음", "없음", "좋음" 등
        //    🆕 "대" 추가: "좋대", "온대", "간대" 등
        if (/[다임음요네지야아어니자래대죠군걸]$/.test(trimmed)) return true;
        // 3) 감탄사/감정 표현 끝
        if (/[ㅋㅎㅠㅜ]+$/.test(trimmed)) return true;
        return false;
      };
      
      // 🆕 각 라인의 호흡 그룹 계산
      // - 이전 라인이 "문장 끝"이면 → 새 호흡 그룹
      // - 이전 라인이 "문장 안 끝남"이면 → 같은 호흡 그룹 (이어짐!)
      let currentBreathGroup = 0;
      
      breathLines.forEach((breathLine, lineIdx) => {
        // 첫 줄이 아니고, 이전 줄이 문장 안 끝났으면 같은 호흡 그룹
        // (새 호흡 그룹 시작 안 함)
        if (lineIdx > 0) {
          const prevLine = breathLines[lineIdx - 1];
          if (isSentenceEnd(prevLine)) {
            // 이전 줄이 문장 끝남 → 새 호흡 그룹
            currentBreathGroup++;
          }
          // 이전 줄이 문장 안 끝남 → 같은 호흡 그룹 (이어지게)
        }
        
        // / 가 있으면 그걸로 분리, 없으면 전체가 하나의 자막
        if (breathLine.includes('/')) {
          const subtitleParts = breathLine.split('/').map(s => s.trim()).filter(Boolean);
          subtitleParts.forEach((sub, subIdx) => {
            translatedSegments.push({
              start: lineIdx + subIdx * 0.01,
              end: lineIdx + subIdx * 0.01 + 0.99,
              text: sub,
              breathGroup: currentBreathGroup,
            });
          });
        } else {
          translatedSegments.push({
            start: lineIdx,
            end: lineIdx + 0.99,
            text: breathLine,
            breathGroup: currentBreathGroup,
          });
        }
      });
      
      // 🆕 디버깅 로그
      const groupCount = new Set(translatedSegments.map(s => s.breathGroup)).size;
      console.log(`[product] 📢 호흡 그룹 분석: ${breathLines.length}줄 → ${groupCount}개 호흡 그룹 (스마트 이어짐)`);
    } // ← 참고/무시 모드 분기 닫기

  } else if (videoType === 'story') {
    // ===== 썰 쇼츠 모드 =====
    // 영상 → Vision 분석 → 몰입형 썰 스토리 재구성 → 더빙
    const originalFullText = transcription.segments && transcription.segments.length > 0
      ? transcription.segments.map(s => s.text).join(' ')
      : transcription.text;

    // 4-0. Vision LLM으로 영상 화면 분석 (스토리 재구성에 매우 중요)
    let visionDesc = '';
    try {
      onProgress('translate', 45, '영상 화면 분석 중...');
      const visionResult = await extractProductFromFrames(
        originalPath,
        videoDuration,
        config,
        onProgress
      );
      if (visionResult && visionResult.description) {
        visionDesc = visionResult.description;
      } else if (visionResult && visionResult.main) {
        visionDesc = visionResult.main + (visionResult.description ? '\n' + visionResult.description : '');
      }
      // 나중에 쿠팡 키워드로도 사용 가능하도록 캐시
      config._cachedVisionResult = visionResult;
    } catch (e) {
      console.warn('[story] Vision 분석 실패, 음성만으로 진행:', e.message);
    }

    // 4-1. 드라마 각본 스크립트 생성 (원본 대본 순서 유지)
    adCopy = await generateStoryScript(
      originalFullText,
      videoDuration,
      visionDesc,
      targetLang,
      config,
      onProgress,
      transcription.segments  // Whisper 세그먼트 전달 (타임스탬프 순서)
    );
    fullTranslation = adCopy;

    // 4-2. 각 문장을 세그먼트로 변환 (시간 정보는 나중에 TTS 후 채움)
    // 화자 태그 파싱: [F1] 텍스트 → { speaker: 'F1', text: '텍스트' }
    const storyLines = adCopy.split('\n').map(l => l.trim()).filter(Boolean);
    translatedSegments = storyLines.map((line, i) => {
      const parsed = parseSpeakerTag(line);
      return {
        start: i,
        end: i + 1,
        text: parsed.text,         // 자막용 (태그 제거된 깨끗한 텍스트)
        speaker: parsed.speaker,   // TTS용 (NARR/F1/F2/F3/M1/M2/M3)
      };
    });

  } else if (videoType === 'reaction') {
    // ===== 🎬 예능/리액션 모드 =====
    // 긴 영상 → AI가 재미있는 구간 추출 → 1분 이내로 압축 → 썰 스타일 재구성
    const origSegs = transcription.segments || [];
    if (origSegs.length === 0) {
      throw new Error('예능 모드는 음성이 있는 영상이 필요합니다.');
    }

    onProgress('translate', 42, '🎬 영상 분석 중 (재미있는 구간 찾기)...');

    // 4-1. Vision 분석 (예능 영상 상황 파악)
    let visionDesc = '';
    try {
      const visionResult = await extractProductFromFrames(
        originalPath, videoDuration, config, onProgress
      );
      if (visionResult) {
        visionDesc = visionResult.description || visionResult.main || '';
      }
    } catch (e) {
      console.warn('[reaction] Vision 분석 스킵:', e.message);
    }

    // 4-2. LLM이 재미있는 구간 선택 (Whisper 세그먼트 분석)
    const targetLen = parseInt(config.reactionTargetLen) || 45;
    const highlights = await extractReactionHighlights(
      origSegs, videoDuration, visionDesc, targetLen, config, onProgress
    );

    if (!highlights || highlights.length === 0) {
      throw new Error('재미있는 구간을 찾지 못했어요. 영상이 너무 짧거나 음성이 없을 수 있습니다.');
    }

    onProgress('translate', 50, '✂️ 하이라이트 구간 추출 중...');

    // 4-3. 선택된 구간들로 새 영상 만들기 (ffmpeg concat)
    const reactionVideoPath = await buildReactionClip(
      originalPath, highlights, jobDir, onProgress
    );

    // 이후 단계에서 새로 만들어진 영상을 사용하도록 originalPath 교체
    config.__reactionVideoPath = reactionVideoPath;
    config.__reactionHighlights = highlights; // 하이브리드 음성용
    const reactionDuration = await getMediaDuration(reactionVideoPath);

    // 4-4. 썰 스타일 스크립트 작성
    onProgress('translate', 56, '✍️ 썰 스타일 스크립트 작성 중...');
    const reactionFullText = highlights.map(h => h.text).join(' ');
    adCopy = await generateReactionScript(
      reactionFullText, reactionDuration, visionDesc, targetLang, config, onProgress
    );
    fullTranslation = adCopy;

    // 4-5. 자막용 세그먼트 생성 (태그 없음)
    const reactionLines = adCopy.split('\n').map(l => l.trim()).filter(Boolean);
    translatedSegments = reactionLines.map((line, i) => ({
      start: i,
      end: i + 1,
      text: line,
    }));

  } else {
    // ===== 토킹 모드 =====
    const narrationMode = config.narrationMode === true;

    if (narrationMode) {
      // === 요약 나레이션 모드 ===
      // 긴 영상 → 하이라이트 구간들 + 나레이션
      // Whisper 세그먼트로 LLM이 핵심 포인트 뽑아냄
      const origSegs = transcription.segments || [];
      if (origSegs.length === 0) {
        throw new Error('요약 나레이션 모드는 음성이 있는 영상이 필요합니다.');
      }

      // 핵심 포인트 + 나레이션 생성
      const points = await generateSummaryNarration(
        origSegs,
        videoDuration,
        targetLang,
        config,
        onProgress
      );

      // 나레이션 TTS + 하이라이트 편집
      const summaryResult = await renderSummaryVideo({
        originalPath,
        points,
        ttsVoice,
        outputPath: path.join(jobDir, 'summary_pre.mp4'),
        jobDir,
        onProgress,
      });

      // 자막용 세그먼트 (나레이션 타이밍 기반)
      translatedSegments = summaryResult.segments;
      fullTranslation = points.map(p => p.narration).join('\n');

      // ⚡ 이 파일(summary_pre.mp4)은 이미 편집된 영상이라 composeFinalVideo에서
      // 원본 대신 이걸 사용해야 함. summaryOriginalPath에 저장
      config.__summaryVideoPath = summaryResult.concatPath;

    } else if (transcription.segments && transcription.segments.length > 0) {
      // 🔴 인물 모드
      const origSegs = transcription.segments;
      
      console.log(`[talking-lipsync] ========================================`);
      console.log(`[talking-lipsync] 실제 영상: ${videoDuration.toFixed(2)}초`);
      console.log(`[talking-lipsync] Whisper: ${origSegs.length}세그먼트`);
      
      if (config.talkingScript && config.talkingScript.trim()) {
        // 🎯 모드 A: 사용자가 직접 번역본 제공
        onProgress('translate', 40, '📝 사용자 번역 대본 + 립싱크 매칭 중...');
        
        // 대본 정리
        let cleanScript = config.talkingScript
          .replace(/\.{2,}/g, '')
          .replace(/\.\s*$/gm, '')
          .trim();
        
        const cleanLines = cleanScript.split('\n').map(l => l.trim()).filter(Boolean);
        console.log(`[talking-lipsync] 사용자 대본: ${cleanLines.length}줄`);
        
        // 🆕 매핑 정보 로깅
        const hasLineMap = Array.isArray(config.talkingLineMap) && config.talkingLineMap.length === cleanLines.length;
        const hasOrigSegs = Array.isArray(config.talkingWhisperSegments) && config.talkingWhisperSegments.length > 0;
        if (hasLineMap && hasOrigSegs) {
          console.log(`[talking-lipsync] 🎯 정확한 매핑 정보 감지됨 (립싱크 정확도 최상)`);
        } else {
          console.log(`[talking-lipsync] 매핑 정보 없음 - 스마트 정렬로 대체 (lineMap:${hasLineMap}, origSegs:${hasOrigSegs})`);
        }
        
        translatedSegments = [];
        
        if (cleanLines.length === origSegs.length) {
          // ✅ 완벽 매칭: 1:1
          cleanLines.forEach((line, i) => {
            translatedSegments.push({
              start: origSegs[i].start,
              end: origSegs[i].end,
              text: line,
            });
          });
          console.log(`[talking-lipsync] ✅ 1:1 완벽 매칭!`);
          
          // 🆕 1:1 매칭에서도 갭 메우기 + 마지막 자막 연장
          for (let i = 0; i < translatedSegments.length; i++) {
            const cur = translatedSegments[i];
            const next = translatedSegments[i + 1];
            
            // 다음 자막까지 갭 메우기 (자막 공백 없애기)
            if (next && cur.end < next.start) {
              cur.end = next.start;
            }
          }
          
          // 🎯 마지막 자막을 영상 끝까지 연장 (끊김 방지)
          if (videoDuration && videoDuration > 0 && translatedSegments.length > 0) {
            const lastSeg = translatedSegments[translatedSegments.length - 1];
            if (lastSeg.end < videoDuration - 0.3) {
              const originalEnd = lastSeg.end;
              lastSeg.end = Number(videoDuration.toFixed(3));
              console.log(`[talking-lipsync] 🎯 마지막 자막 연장: ${originalEnd.toFixed(2)}초 → ${lastSeg.end.toFixed(2)}초 (영상 끝까지)`);
            }
          }
        } else {
          // 🔴 스마트 정렬 (lineMap 있으면 최우선 사용)
          console.warn(`[talking-lipsync] ⚠️ 세그먼트(${origSegs.length})와 대본(${cleanLines.length}) 수 불일치`);
          console.log(`[talking-lipsync] → 스마트 정렬 적용`);
          
          // 🆕 lineMap이 있으면 그걸 기반으로 정렬 (원본 타이밍 보존)
          // 🆕 videoDuration 전달: 마지막 자막을 영상 끝까지 연장하도록
          translatedSegments = alignScriptToWhisper(
            origSegs, 
            cleanLines,
            hasLineMap ? config.talkingLineMap : null,
            videoDuration
          );
        }
        
        fullTranslation = cleanLines.join('\n');
        
      } else {
        // 🎯 모드 B: 자동 번역 (세그먼트 1:1 유지!)
        onProgress('translate', 40, '🤖 세그먼트별 자동 번역 중...');
        console.log(`[talking-lipsync] 자동 번역 모드 - 세그먼트 1:1 유지`);
        
        // 기존 translateSegments 사용 (세그먼트 수 유지됨)
        translatedSegments = await translateSegments(
          origSegs,
          detectedLang,
          targetLang,
          mode,
          config,
          onProgress
        );
        fullTranslation = translatedSegments.map(s => s.text).join('\n');
        
        // 🆕 자동 번역 모드도 갭 메우기 + 마지막 자막 연장
        for (let i = 0; i < translatedSegments.length; i++) {
          const cur = translatedSegments[i];
          const next = translatedSegments[i + 1];
          if (next && cur.end < next.start) {
            cur.end = next.start;
          }
        }
        if (videoDuration && videoDuration > 0 && translatedSegments.length > 0) {
          const lastSeg = translatedSegments[translatedSegments.length - 1];
          if (lastSeg.end < videoDuration - 0.3) {
            const originalEnd = lastSeg.end;
            lastSeg.end = Number(videoDuration.toFixed(3));
            console.log(`[talking-lipsync] 🎯 마지막 자막 연장 (자동번역): ${originalEnd.toFixed(2)}초 → ${lastSeg.end.toFixed(2)}초`);
          }
        }
      }
      
      // 결과 로그
      console.log(`[talking-lipsync] 최종: ${translatedSegments.length}개 자막`);
      translatedSegments.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i+1}. [${s.start.toFixed(2)}~${s.end.toFixed(2)}s] "${s.text.substring(0, 25)}..."`);
      });
      if (translatedSegments.length > 5) {
        console.log(`  ... (${translatedSegments.length - 5}개 더)`);
      }
      console.log(`[talking-lipsync] ✅ 완료`);
    } else {
      fullTranslation = transcription.text;
      translatedSegments = [{ start: 0, end: 5, text: fullTranslation }];
    }
  }

  // 5. 자막 청크 분할
  // 인물 모드 + 확정 대본이면 그대로 사용 (줄바꿈 = 자막 단위)
  let chunkedSegments;
  if (videoType === 'talking' && config.talkingScript && config.talkingScript.trim()) {
    // 확정 대본은 분할하지 않음 - 줄바꿈 그대로 자막
    chunkedSegments = translatedSegments;
    console.log(`[talking] 확정 대본 사용 - 분할 스킵: ${chunkedSegments.length}줄`);
  } else {
    // 제품 모드도 긴 문장은 분할 (한 자막에 너무 많은 글자 방지)
    chunkedSegments = splitSegmentsForDisplay(translatedSegments, 'phrase', targetLang);
  }
  
  // 🆕 🚨 모든 경로의 자막에서 "/" 최종 제거 (완벽 안전장치)
  // 어떤 모드/경로든 자막에 "/" 가 절대 나오면 안 됨
  chunkedSegments = chunkedSegments.map(seg => {
    if (seg && seg.text && seg.text.includes('/')) {
      const cleaned = seg.text.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`[자막정리] "/" 제거: "${seg.text}" → "${cleaned}"`);
      return { ...seg, text: cleaned };
    }
    return seg;
  });

  // 6. 오디오 트랙 결정
  let audioTrackPath;
  let displaySegments;

  // 🎬 reaction 모드: hybrid(더빙+원본 믹스) / dub(더빙만) / original(자막만)
  const reactionDub = videoType === 'reaction' && config.reactionAudioMode !== 'original';
  const reactionOriginal = videoType === 'reaction' && config.reactionAudioMode === 'original';

  // 하이브리드면 합성 단계에서 원본 음성도 믹스하라고 신호
  if (videoType === 'reaction' && config.reactionAudioMode === 'hybrid') {
    config.mixOriginalAudio = 'hybrid';
  }

  if (videoType === 'product' || videoType === 'story' || reactionDub) {
    // 제품/드라마/예능(더빙) 모드: 카피/스토리 문장별 TTS → 순차 이어붙이기
    onProgress('tts', 60,
      videoType === 'story' ? '드라마 음성 생성 중...' :
      videoType === 'reaction' ? '🎬 예능 더빙 음성 생성 중...' :
      '광고 음성 생성 중...');

    const edgeTts = process.platform === 'win32' ? 'edge-tts.exe' : 'edge-tts';
    const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

    // 원본 카피/드라마 줄 단위로 TTS
    // 드라마 모드: [F1] 텍스트 형식 → 화자별 다른 목소리
    // 제품/예능 모드: 일반 텍스트 → ttsVoice 하나
    const isDrama = videoType === 'story';

    // 드라마 목소리 맵: 수동 선택 우선, 없으면 기본 매핑
    let dramaVoiceMap = null;
    if (isDrama) {
      const defaultMap = DRAMA_VOICE_MAP[targetLang] || DRAMA_VOICE_MAP.ko;
      if (config.dramaVoiceMode === 'manual' && config.dramaVoices) {
        // 수동 선택: 사용자가 지정한 목소리 사용, 빈 값은 기본값으로 fallback
        const user = config.dramaVoices;
        dramaVoiceMap = {
          NARR: user.NARR || defaultMap.NARR,
          F1:   user.F1   || defaultMap.F1,
          F2:   user.F1   || defaultMap.F2,  // F2는 F1 재사용
          F3:   user.F3   || defaultMap.F3,
          M1:   user.M1   || defaultMap.M1,
          M2:   user.M1   || defaultMap.M2,  // M2는 M1 재사용
          M3:   user.M3   || defaultMap.M3,
        };
        console.log('[drama] 🎭 수동 선택 목소리 사용:', dramaVoiceMap);
      } else {
        dramaVoiceMap = defaultMap;
        console.log('[drama] 🤖 자동 매핑 목소리 사용');
      }
    }

    const adLines = adCopy.split('\n').map(l => l.trim()).filter(Boolean);

    // 🔴 화자 자동 추정 휴리스틱 (LLM이 태그 안 붙였을 때 fallback)
    // 한국어 드라마 대사/나레이션의 언어적 특징으로 화자 추측
    function guessSpeakerFromText(text, prevSpeaker) {
      const t = text.trim();

      // 나레이션 패턴: 과거형 서술, 드라마 내레이션 어조
      const narrationPatterns = [
        /였다\.?$/, /였었다\.?$/, /하였다\.?$/, /되었다\.?$/,
        /그\s*순간/, /그때/, /마침내/, /운명/, /그러나/, /그리고는/,
        /알지\s*못했다/, /깨달았다/, /뒤틀렸다/, /무너져/,
        /^그는\s/, /^그녀는\s/, /^그들은\s/,
        /^재벌/, /^회장/, /독자였/,
      ];
      if (narrationPatterns.some(p => p.test(t))) {
        return 'NARR';
      }

      // 여자 호칭 → 여자 대사
      const femaleCallPatterns = [
        /오빠[,\s!?]/, /^오빠/, /아빠[,\s!?]/, /아저씨[,\s!?]/,
        /어머님/, /아버님/, /선배[,\s!?]/,
      ];
      if (femaleCallPatterns.some(p => p.test(t))) {
        return 'F1';
      }

      // 남자 호칭/말투 → 남자 대사
      const maleCallPatterns = [
        /^야[,\s!?]/, /자기야/, /여보[,\s!?]/,
        /누나[,\s!?]/, /^누나/,
      ];
      if (maleCallPatterns.some(p => p.test(t))) {
        return 'M1';
      }

      // 어른 말투 (반말 명령, 강한 어조)
      const elderPatterns = [
        /절대\s*안\s*돼/, /허락\s*못\s*해/, /집안/, /안\s*된다/,
        /우리\s*집/, /내\s*아들/, /내\s*딸/,
      ];
      if (elderPatterns.some(p => p.test(t))) {
        // 이전 화자 기반 추측
        return prevSpeaker === 'F3' ? 'F3' : 'M3';
      }

      // 대사인데 분류 못하면 이전 화자와 다른 젊은 화자로 번갈아
      if (prevSpeaker === 'F1') return 'M1';
      if (prevSpeaker === 'M1') return 'F1';
      if (prevSpeaker === 'NARR') return 'F1';
      return 'F1';
    }

    // 드라마 모드면 각 라인의 화자 태그 파싱
    // 1차: LLM 태그 사용 / 2차: 태그 없으면 휴리스틱 추정
    let lastGuessedSpeaker = 'NARR';
    const parsedLines = adLines.map((line, idx) => {
      if (isDrama) {
        const parsed = parseSpeakerTag(line);
        let speaker = parsed.speaker;
        // parser가 NARR fallback인데 원본에 [태그]가 없었으면 휴리스틱 시도
        const hadTag = /^\**\[(NARR|F[1-3]|M[1-3])\]/i.test(line.trim().replace(/^\**\s*/, ''));
        if (!hadTag) {
          speaker = guessSpeakerFromText(parsed.text, lastGuessedSpeaker);
        }
        lastGuessedSpeaker = speaker;
        return {
          rawLine: line,
          text: parsed.text,
          voice: dramaVoiceMap[speaker] || dramaVoiceMap.NARR,
          speaker: speaker,
          guessed: !hadTag,
        };
      }
      return { rawLine: line, text: line, voice: ttsVoice, speaker: null };
    });

    // 🔴 드라마 모드 디버깅: 화자 분포 로깅
    if (isDrama) {
      const speakerCounts = {};
      let guessedCount = 0;
      parsedLines.forEach(pl => {
        speakerCounts[pl.speaker] = (speakerCounts[pl.speaker] || 0) + 1;
        if (pl.guessed) guessedCount++;
      });
      console.log('[drama] 화자 분포:', speakerCounts);
      console.log(`[drama] 휴리스틱 추정: ${guessedCount}/${parsedLines.length}줄 (LLM 태그: ${parsedLines.length - guessedCount}줄)`);
      console.log('[drama] 처음 5줄 샘플:');
      parsedLines.slice(0, 5).forEach((pl, i) => {
        const voiceName = pl.voice.split('-').pop();
        const tag = pl.guessed ? '[추정]' : '[LLM]';
        console.log(`  ${i+1}. ${tag} [${pl.speaker}] ${voiceName} "${pl.text.substring(0, 30)}..."`);
      });

      // 여전히 한 명만 나오면 경고
      const uniqueSpeakers = Object.keys(speakerCounts);
      if (uniqueSpeakers.length === 1) {
        console.warn(`[drama] ⚠️ 모든 라인이 ${uniqueSpeakers[0]}로 분류됨! 휴리스틱도 실패.`);
        console.warn('[drama] 원본 LLM 응답 첫 3줄:');
        adLines.slice(0, 3).forEach((line, i) => {
          console.warn(`  ${i+1}. "${line}"`);
        });
      }
    }

    // 1) 제품 모드: breathGroup 단위로 TTS 생성 (호흡 자연스럽게)
    // 드라마/예능은 줄별로 화자가 다를 수 있어서 줄 단위 유지
    const ttsLines = [];
    
    // 🎤 타입캐스트/외부 TTS 파일 사용 체크
    const useCustomTts = config.customTtsPath && fs.existsSync(config.customTtsPath);
    
    if (useCustomTts) {
      console.log(`[TTS] 외부 TTS 파일 사용: ${config.customTtsPath}`);
      onProgress('tts', 65, '🎤 외부 TTS 파일 적용 중...');
      
      // 외부 TTS 파일을 그대로 사용
      const customTtsDest = path.join(jobDir, 'custom_tts.mp3');
      fs.copyFileSync(config.customTtsPath, customTtsDest);
      
      const ttsDuration = await getMediaDuration(customTtsDest);
      ttsLines.push({
        path: customTtsDest,
        duration: ttsDuration,
        text: fullTranslation,
        isCustomTts: true,
      });
      
      console.log(`[TTS] 외부 TTS 적용 완료: ${ttsDuration.toFixed(1)}초`);
    } else {
      // 🆕 ttsProvider 라디오 우선 - 명시적 선택 존중
      const provider = (config.ttsProvider || '').toLowerCase();
      const useTypecast = (provider === 'typecast') && config.typecastVoice && config.typecastApiKey;
      const useElevenLabs = !useTypecast && (
        (provider === 'elevenlabs') || 
        (provider !== 'edge' && config.elevenLabsVoice && config.elevenLabsApiKey)
      ) && config.elevenLabsVoice && config.elevenLabsApiKey;
      
      // 🔧 진단 로그 - TTS Provider 선택 조건 상세
      console.log('========================================');
      console.log('[TTS Provider 진단]');
      console.log('========================================');
      console.log('  ttsProvider (raw):', config.ttsProvider);
      console.log('  provider (lower):', provider);
      console.log('  config.typecastVoice 있나?:', config.typecastVoice ? '✅ 예' : '❌ 아니오');
      if (config.typecastVoice) {
        console.log('    voiceId:', config.typecastVoice.voiceId);
        console.log('    name:', config.typecastVoice.name);
      }
      console.log('  config.typecastApiKey 있나?:', config.typecastApiKey ? `✅ 예 (${config.typecastApiKey.length}자)` : '❌ 아니오');
      console.log('  → useTypecast:', useTypecast);
      console.log('  → useElevenLabs:', useElevenLabs);
      console.log('========================================');
      
      if (useTypecast) {
        console.log(`[TTS] 🎙️ 타입캐스트 사용: ${config.typecastVoice.name || config.typecastVoice.voiceId}`);
      } else if (useElevenLabs) {
        console.log(`[TTS] 🎙️ ElevenLabs 사용: ${config.elevenLabsVoice.name || config.elevenLabsVoice.voiceId}`);
      } else {
        console.log(`[TTS] 🎙️ Edge TTS (무료) 사용`);
      }
    
      if (!isDrama && videoType === 'product') {
      // 🔴 제품 모드: breathGroup 단위로 TTS 생성
      // breathGroup이 같은 세그먼트들은 하나의 TTS로 합침 (/ 제거)
      const breathGroups = {};
      translatedSegments.forEach(seg => {
        const groupId = seg.breathGroup !== undefined ? seg.breathGroup : 0;
        if (!breathGroups[groupId]) breathGroups[groupId] = [];
        breathGroups[groupId].push(seg.text);
      });
      
      const groupIds = Object.keys(breathGroups).sort((a, b) => Number(a) - Number(b));
      
      for (let gi = 0; gi < groupIds.length; gi++) {
        const groupId = groupIds[gi];
        const texts = breathGroups[groupId];
        // 같은 호흡 그룹의 텍스트들을 공백으로 연결 (자연스러운 호흡)
        let combinedText = texts.join(' ').trim();
        
        // 🆕 텍스트 정리: Edge TTS가 처리 못하는 특수문자 제거
        // 일부 특수문자/이모지가 있으면 TTS 실패 원인이 됨
        combinedText = combinedText
          .replace(/[""''`]/g, '')    // 스마트 따옴표 제거
          .replace(/[—–]/g, '-')       // 긴 대시 정규화
          .replace(/\s+/g, ' ')        // 연속 공백 정리
          .trim();
        
        // 빈 텍스트 스킵
        if (!combinedText) {
          console.warn(`[product] 그룹 ${groupId}: 빈 텍스트, 스킵`);
          continue;
        }
        
        // 문장 끝 처리
        if (!/[.!?~。！？]$/.test(combinedText)) {
          combinedText += '.';  // 🆕 ! → . 로 (TTS가 느낌표에 과장 억양 붙이는 거 완화)
        }
        
        const segAudioPath = path.join(jobDir, `tts_${gi}.mp3`);
        
        // 🆕 재시도 로직 (최대 2번 시도)
        let ttsSuccess = false;
        for (let attempt = 1; attempt <= 2 && !ttsSuccess; attempt++) {
          try {
            if (useTypecast) {
              // 🆕 타입캐스트 TTS
              onProgress('tts', 60 + (gi / groupIds.length) * 8,
                `🎙️ 타입캐스트 ${gi + 1}/${groupIds.length}`);
              await generateTypecastTTS(
                combinedText,
                config.typecastVoice.voiceId,
                segAudioPath,
                config.typecastApiKey,
                onProgress
              );
            } else if (useElevenLabs) {
              // ElevenLabs TTS
              onProgress('tts', 60 + (gi / groupIds.length) * 8,
                `✨ ElevenLabs ${gi + 1}/${groupIds.length}`);
              await generateElevenLabsTTS(
                combinedText,
                config.elevenLabsVoice.voiceId,
                segAudioPath,
                config.elevenLabsApiKey,
                onProgress
              );
            } else {
              // Edge TTS (무료)
              onProgress('tts', 60 + (gi / groupIds.length) * 8,
                `음성 ${gi + 1}/${groupIds.length} (${combinedText.length}자)`);
              await runCommand(edgeTts, [
                '--voice', ttsVoice,
                '--rate', '+10%',
                '--text', combinedText,
                '--write-media', segAudioPath,
              ]);
            }
            
            // 파일 생성 확인
            if (!fs.existsSync(segAudioPath)) {
              throw new Error(`TTS 파일 생성 안 됨: ${segAudioPath}`);
            }
            
            const dur = await getMediaDuration(segAudioPath);
            if (dur < 0.1) {
              throw new Error(`TTS 길이 너무 짧음: ${dur}초`);
            }
            
            ttsLines.push({
              path: segAudioPath,
              duration: dur,
              text: combinedText,
              breathGroup: Number(groupId),
              subtitleTexts: texts,
            });
            ttsSuccess = true;
          } catch (e) {
            console.warn(`[product] TTS 실패 (그룹 ${groupId}, 시도 ${attempt}/2):`, e.message);
            if (attempt === 2) {
              console.error(`[product] ❌ 그룹 ${groupId} 최종 실패: "${combinedText.substring(0, 50)}..."`);
            } else {
              // 1초 대기 후 재시도
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
      }
      
      console.log(`[product] TTS 생성 완료: ${ttsLines.length}개 호흡 그룹 (총 ${groupIds.length}개 중)`);
    } else {
      // 드라마/예능: 줄별 TTS (화자별 다른 목소리)
      for (let i = 0; i < parsedLines.length; i++) {
        const pl = parsedLines[i];
        onProgress('tts', 60 + (i / parsedLines.length) * 8,
          isDrama
            ? `음성 ${i + 1}/${parsedLines.length} (${pl.speaker})`
            : `음성 ${i + 1}/${parsedLines.length}`);

        const rawAudioPath = path.join(jobDir, `product_${i}_raw.mp3`);
        const lineAudioPath = path.join(jobDir, `product_${i}.mp3`);
        try {
          // (1) Edge TTS로 원본 생성 (기본 속도 +10%)
          await runCommand(edgeTts, [
            '--voice', pl.voice,
            '--rate', '+15%',
            '--text', pl.text,
            '--write-media', rawAudioPath,
          ]);

          // 🔙 레퍼런스 영상 기준 원래 설정으로 복원
          // 앞뒤 모두 silenceremove (공백 0.16초 수준의 자연스러운 광고 속도)
          try {
            await runCommand(ffmpeg, [
              '-y',
              '-i', rawAudioPath,
              '-af', 'silenceremove=start_periods=1:start_duration=0.08:start_threshold=-40dB:stop_periods=-1:stop_duration=0.08:stop_threshold=-40dB',
              '-c:a', 'libmp3lame',
              '-b:a', '192k',
              lineAudioPath,
            ]);
            const trimmedDur = await getMediaDuration(lineAudioPath);
            if (trimmedDur < 0.2) {
              fs.copyFileSync(rawAudioPath, lineAudioPath);
            }
          } catch (trimErr) {
            fs.copyFileSync(rawAudioPath, lineAudioPath);
          }
          
          // (3) 원본 raw 파일 삭제
          try { fs.unlinkSync(rawAudioPath); } catch (e) {}

          const dur = await getMediaDuration(lineAudioPath);
          ttsLines.push({ path: lineAudioPath, duration: dur, text: pl.text });
        } catch (e) {
          console.error('TTS 실패:', i, pl.speaker, e.message);
        }
      }
    }
    } // ← customTts else 분기 닫기

    if (ttsLines.length === 0) {
      throw new Error('TTS 생성 실패');
    }

    // 🔴 2) 영상 길이에 맞춰 TTS 분산 배치 (무음 패딩 방식 X)
    const videoLen = videoDuration; // 원본 영상 길이
    let totalTtsDuration = ttsLines.reduce((s, tl) => s + tl.duration, 0);

    // 🔴 마지막 멘트 보호: outroText가 있으면 마지막 N개 라인은 절대 안 자름
    const outroLineCount = config.outroText 
      ? config.outroText.trim().split('\n').filter(l => l.trim()).length 
      : 0;
    const protectedLines = outroLineCount; // 마지막 멘트 줄 수만큼 보호

    // 🔴 TTS가 영상보다 길면 → 자르지 말고 TTS 속도 높여서 재생성
    if (totalTtsDuration > videoLen + 0.5) {
      const overrun = totalTtsDuration - videoLen;
      const speedupPercent = Math.min(30, Math.ceil((overrun / videoLen) * 100) + 5);
      console.warn(`[tts] TTS(${totalTtsDuration.toFixed(1)}s)가 영상(${videoLen.toFixed(1)}s)보다 ${overrun.toFixed(1)}초 김`);
      console.log(`[tts] → 내용 자르지 않고 TTS 속도 +${15 + speedupPercent}%로 재생성`);
      
      // 모든 TTS 파일 삭제 후 더 빠른 속도로 재생성
      for (const tl of ttsLines) {
        try { fs.unlinkSync(tl.path); } catch (e) {}
      }
      ttsLines.length = 0;
      
      const newRate = `+${15 + speedupPercent}%`;
      for (let i = 0; i < parsedLines.length; i++) {
        const pl = parsedLines[i];
        const rawAudioPath = path.join(jobDir, `product_${i}_raw.mp3`);
        const lineAudioPath = path.join(jobDir, `product_${i}.mp3`);
        try {
          await runCommand(edgeTts, [
            '--voice', pl.voice,
            '--rate', newRate,
            '--text', pl.text,
            '--write-media', rawAudioPath,
          ]);
          // 🔙 레퍼런스 기준 복원
          try {
            await runCommand(ffmpeg, [
              '-y', '-i', rawAudioPath,
              '-af', 'silenceremove=start_periods=1:start_duration=0.08:start_threshold=-40dB:stop_periods=-1:stop_duration=0.08:stop_threshold=-40dB',
              '-c:a', 'libmp3lame', '-b:a', '192k',
              lineAudioPath,
            ]);
            const trimmedDur = await getMediaDuration(lineAudioPath);
            if (trimmedDur < 0.2) fs.copyFileSync(rawAudioPath, lineAudioPath);
          } catch { fs.copyFileSync(rawAudioPath, lineAudioPath); }
          try { fs.unlinkSync(rawAudioPath); } catch (e) {}
          
          const dur = await getMediaDuration(lineAudioPath);
          ttsLines.push({ path: lineAudioPath, duration: dur, text: pl.text });
        } catch (e) {
          console.error('TTS 재생성 실패:', i, e.message);
        }
      }
      totalTtsDuration = ttsLines.reduce((s, tl) => s + tl.duration, 0);
      console.log(`[tts] 재생성 후: ${totalTtsDuration.toFixed(1)}s`);
    }

    const placed = [];

    if (isDrama && videoLen > totalTtsDuration + 2) {
      // 드라마 모드 + 영상이 TTS보다 충분히 길면: 자연스럽게 분산
      // 🔴 중요: 라인 사이 간격을 최대 1.5초로 제한 (너무 크면 대사 사이 긴 침묵)
      // 남는 시간은 앞뒤로 패딩
      const MAX_GAP = 1.5;  // 라인 사이 최대 간격
      const naturalGap = 0.3; // 자연스러운 최소 간격
      const numGaps = Math.max(1, ttsLines.length - 1);

      // 이상적 간격 = 모든 여유 시간을 균등 분배
      const idealGap = ttsLines.length > 1
        ? (videoLen - totalTtsDuration - 2) / numGaps
        : 0;
      // MAX_GAP으로 제한
      const gapBetween = Math.max(naturalGap, Math.min(MAX_GAP, idealGap));

      // 모든 라인 + 간격의 총 길이
      const contentLen = totalTtsDuration + gapBetween * numGaps;
      // 시작 패딩: 남는 시간의 30% (앞부분에 여유), 나머지는 뒤로
      const leftover = Math.max(1.0, videoLen - contentLen);
      const startPadding = Math.min(2.0, leftover * 0.3);

      let currentTime = startPadding;
      for (const tl of ttsLines) {
        placed.push({
          path: tl.path,
          start: currentTime,
          end: currentTime + tl.duration,
          text: tl.text,
        });
        currentTime += tl.duration + gapBetween;
      }
      console.log(`[drama] 영상 ${videoLen.toFixed(1)}초, TTS ${totalTtsDuration.toFixed(1)}초, ${ttsLines.length}줄, 라인간 ${gapBetween.toFixed(2)}초, 시작 패딩 ${startPadding.toFixed(1)}초`);
    } else {
      // 제품 모드 or TTS가 영상보다 긴 경우: 연속 배치
      // 🔴 GAP 0: 각 문장을 텀 없이 바로 이어붙임 (광고 카피 템포 중요)
      //    TTS 앞뒤 무음은 silenceremove로 트림해서 더 빡빡하게
      
      // 🔴 TTS가 영상보다 짧으면 → 문장 사이에 간격 추가해서 채우기
      const shortfall = videoLen - totalTtsDuration;
      
      // 🔙 레퍼런스 영상 분석 결과: 문장 사이 0.16초 무음 간격
      // → GAP 0.15초로 맞춤 (레퍼런스와 동일한 자연스러운 광고 속도)
      const GAP = 0.15;
      console.log(`[tts] 문장 사이 호흡: ${GAP}초 (레퍼런스 기준)`);
      
      // TTS 시작은 바로
      let currentTime = 0;
      console.log(`[tts] 시작: 0초부터 바로 재생`);
      
      for (const tl of ttsLines) {
        placed.push({
          path: tl.path,
          start: currentTime,
          end: currentTime + tl.duration,
          text: tl.text,
          originalLines: tl.subtitleTexts || [tl.text],
        });
        currentTime += tl.duration + GAP;
      }
    }

    // 3) ffmpeg로 concat (이어붙이기)
    // adelay + amix 방식
    const filterParts = [];
    const inputArgs = [];
    placed.forEach((p, i) => {
      inputArgs.push('-i', p.path);
      const delayMs = Math.round(p.start * 1000);
      if (delayMs > 0) {
        filterParts.push(`[${i}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
      } else {
        filterParts.push(`[${i}:a]anull[a${i}]`);
      }
    });

    const mixInputs = placed.map((_, i) => `[a${i}]`).join('');
    filterParts.push(`${mixInputs}amix=inputs=${placed.length}:dropout_transition=0:normalize=0[aout]`);

    const filterComplex = filterParts.join(';');
    const filterScriptPath = ttsPath.replace(/\.mp3$/, '.filter.txt');
    fs.writeFileSync(filterScriptPath, filterComplex, 'utf-8');

    try {
      await runCommand(ffmpeg, [
        '-y',
        ...inputArgs,
        '-filter_complex_script', filterScriptPath,
        '-map', '[aout]',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        ttsPath,
      ]);
    } finally {
      try { fs.unlinkSync(filterScriptPath); } catch (e) {}
      placed.forEach(p => {
        try { fs.unlinkSync(p.path); } catch (e) {}
      });
    }

    audioTrackPath = ttsPath;

    // 4) 자막 분할 - 각 TTS 문장을 청크로 나누고 시간 분배
    // config.subtitleStyle: 'long' (긴글 - 절반에서 한번) | 'short' (짧은글 - 자주 끊기)
    // 🔴 핵심: TTS 시작/끝 시간 = 자막 시작/끝 시간 (정확히 일치!)
    const isReaction = videoType === 'reaction';
    const subtitleStyle = config.subtitleStyle || 'short';
    
    // 🔴 짧은글: 6~8자 (더 자주 끊어서 타이밍 오차 최소화)
    // 🔴 긴글: 15~18자
    const MAX_SUB_CHARS = (isDrama || isReaction) ? 25 : (subtitleStyle === 'long' ? 18 : 8);
    console.log(`[subtitle] 스타일: ${subtitleStyle}, 최대 글자수: ${MAX_SUB_CHARS}`);
    
    const productSegs = [];

    for (const p of placed) {
      if (isDrama || isReaction) {
        // 드라마/예능 썰: 문장 통째로 표시
        productSegs.push({
          start: p.start,
          end: p.end,
          text: p.text,
        });
        continue;
      }

      // 🔴 제품: originalLines 기준으로 자막 표시
      // 사용자가 / 나 줄바꿈으로 나눈 그대로 자막 표시!
      // 추가로 쪼개지 않음 - 사용자가 정한 단위 존중
      
      // originalLines 가져오기 (/ 로 분리된 자막 텍스트들)
      const lines = p.originalLines && p.originalLines.length > 0 
        ? p.originalLines 
        : [p.text];
      
      // ✅ 핵심: 사용자가 나눈 그대로 자막으로 사용 (추가 분할 없음!)
      const subChunks = lines.map(l => l.trim()).filter(Boolean);
      
      console.log(`[subtitle] TTS "${p.text.substring(0,20)}..." → 자막 ${subChunks.length}개: ${JSON.stringify(subChunks).substring(0,80)}`);
      
      if (subChunks.length === 0) continue;

      const totalLen = subChunks.reduce((s, c) => s + c.length, 0);
      let t = p.start;
      const segDuration = p.end - p.start;

      // 🔴 디버깅: TTS와 자막 시간 확인
      console.log(`[subtitle] TTS: ${p.start.toFixed(2)}~${p.end.toFixed(2)}s (${segDuration.toFixed(2)}s), 청크 ${subChunks.length}개`);

      subChunks.forEach((chunk, idx) => {
        const ratio = chunk.length / totalLen;
        const chunkDur = segDuration * ratio;
        const isLast = idx === subChunks.length - 1;
        const chunkEnd = isLast ? p.end : t + chunkDur;
        productSegs.push({
          start: t,
          end: chunkEnd,
          text: chunk,
        });
        // 첫 번째와 마지막 청크만 로그
        if (idx === 0 || isLast) {
          console.log(`    ${idx === 0 ? '첫' : '끝'} 자막: ${t.toFixed(2)}~${chunkEnd.toFixed(2)}s "${chunk.substring(0, 15)}..."`);
        }
        t = chunkEnd;
      });
    }

    displaySegments = productSegs;

    onProgress('tts', 72, isDrama ? '드라마 음성 완료' : (videoType === 'reaction' ? '예능 썰 음성 완료' : '광고 음성 완료'));
  } else if (reactionOriginal) {
    // 🎬 예능 썰 - 원본 음성만 모드: 추출된 영상의 음성 그대로 사용 + 번역 자막만
    audioTrackPath = null; // __reactionVideoPath의 오디오 사용
    // 자막은 highlights에서 새 시간으로 매핑 (구간 잘랐으니 시간 재계산)
    let cumTime = 0;
    const reactionSegs = [];
    for (const h of (config.__reactionHighlights || [])) {
      const segDur = h.end - h.start;
      reactionSegs.push({
        start: cumTime,
        end: cumTime + segDur,
        text: h.text || '',
      });
      cumTime += segDur;
    }
    displaySegments = reactionSegs;
  } else {
    // 토킹 모드
    if (config.__summaryVideoPath) {
      // 요약 나레이션 모드: 이미 편집된 영상 사용 (오디오 포함)
      audioTrackPath = null;
      displaySegments = translatedSegments;
    } else {
      // 일반 토킹 모드: 원본 음성 유지
      audioTrackPath = null;
      displaySegments = chunkedSegments;
    }
  }

  // 🚨🚨🚨 최후의 안전장치: 자막 렌더링 직전에 "/" 완전 제거
  // 이 이후로는 자막이 그대로 영상에 그려지므로, 여기가 마지막 기회
  let slashCleanedCount = 0;
  displaySegments = displaySegments.map(seg => {
    if (seg && seg.text && seg.text.includes('/')) {
      const original = seg.text;
      const cleaned = seg.text.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
      slashCleanedCount++;
      console.log(`[자막최종정리] "/" 제거: "${original}" → "${cleaned}"`);
      return { ...seg, text: cleaned };
    }
    return seg;
  });
  if (slashCleanedCount > 0) {
    console.log(`[자막최종정리] 🚨 총 ${slashCleanedCount}개 자막에서 "/" 제거 완료!`);
  } else {
    console.log(`[자막최종정리] ✅ "/" 없음 - 자막 청결`);
  }

  // 7. 합성
  // reaction 모드: 추출된 클립 사용 / summary 모드: 편집된 영상 사용 / 그 외: 원본
  const finalVideoPath = config.__reactionVideoPath || config.__summaryVideoPath || originalPath;
  await composeFinalVideo({
    videoPath: finalVideoPath,
    ttsPath: audioTrackPath,
    segments: displaySegments,
    outputPath,
    jobDir,
    config,
    targetLang,
    onProgress,
  });

  // 7-1. BGM 믹싱 (설정된 경우)
  // 내장 BGM 매핑
  const BUILTIN_BGM_FILES = {
    'upbeat_energetic': 'upbeat_energetic.mp3',
    'upbeat_happy': 'upbeat_happy.mp3',
    'upbeat_funky': 'upbeat_funky.mp3',
    'upbeat_electronic': 'upbeat_electronic.mp3',
    'chill_lofi': 'chill_lofi.mp3',
    'chill_acoustic': 'chill_acoustic.mp3',
    'chill_piano': 'chill_piano.mp3',
    'chill_ambient': 'chill_ambient.mp3',
    'cinematic_epic': 'cinematic_epic.mp3',
    'cinematic_emotional': 'cinematic_emotional.mp3',
    'cinematic_tension': 'cinematic_tension.mp3',
    'cinematic_inspiring': 'cinematic_inspiring.mp3',
    'cute_playful': 'cute_playful.mp3',
    'cute_sweet': 'cute_sweet.mp3',
    'cute_quirky': 'cute_quirky.mp3',
    'hiphop_trap': 'hiphop_trap.mp3',
    'hiphop_boom': 'hiphop_boom.mp3',
    'hiphop_drill': 'hiphop_drill.mp3',
  };
  
  let bgmPath = config.bgmPath;
  
  // 내장 BGM 선택된 경우 경로 변환
  if (!bgmPath && config.builtinBgm && BUILTIN_BGM_FILES[config.builtinBgm]) {
    const bgmFilename = BUILTIN_BGM_FILES[config.builtinBgm];
    // 개발/프로덕션 경로 처리
    const possiblePaths = [
      path.join(__dirname, 'bgm', bgmFilename),
      path.join(process.resourcesPath || '', 'bgm', bgmFilename),
      path.join(path.dirname(__dirname), 'bgm', bgmFilename),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        bgmPath = p;
        console.log(`[BGM] 내장 BGM 발견: ${bgmPath}`);
        break;
      }
    }
    if (!bgmPath) {
      console.warn(`[BGM] 내장 BGM 파일 없음: ${bgmFilename}`);
    }
  }
  
  if (bgmPath && fs.existsSync(bgmPath)) {
    const bgmVolume = config.bgmVolume || 15;
    const bgmOutputPath = outputPath.replace('.mp4', '_bgm.mp4');
    
    try {
      await mixBGM(outputPath, bgmPath, bgmVolume, bgmOutputPath, onProgress);
      // BGM 믹싱된 파일로 교체
      fs.unlinkSync(outputPath);
      fs.renameSync(bgmOutputPath, outputPath);
      console.log('[BGM] 믹싱 완료, 최종 파일 교체');
    } catch (e) {
      console.error('[BGM] 믹싱 실패:', e.message);
      // 실패해도 원본 유지
    }
  }

  // 8. 쿠팡 제품 연결 (쇼핑 모드 + 한국어 출력일 때만)
  let keywordInfo = null;
  let keyword = null;
  let coupangLink = null;
  let coupangSuggestions = [];
  if (mode === 'shopping' && targetLang === 'ko') {
    onProgress('compose', 87, '쿠팡 제품 분석 중...');

    // 🎯 1차: Vision LLM으로 영상에서 실제 제품 인식 (가장 정확)
    // story 모드에서 이미 호출했다면 캐시 재사용 (중복 API 호출 방지)
    let visionResult = config._cachedVisionResult || null;
    if (!visionResult) {
      try {
        visionResult = await extractProductFromFrames(
          originalPath,
          videoDuration,
          config,
          onProgress
        );
      } catch (e) {
        console.error('Vision 분석 실패:', e.message);
      }
    }

    // 2차: 텍스트 기반 분석 (폴백 또는 보조)
    const textResult = await extractKeyword(fullTranslation, config);

    // 결과 결정: Vision이 더 신뢰도 높으면 Vision 사용
    if (visionResult && visionResult.confident) {
      // Vision이 confident → Vision 결과 사용
      keywordInfo = visionResult;
    } else if (textResult.confident) {
      // Vision 실패/불확실 but Text는 confident → Text 사용
      keywordInfo = textResult;
    } else if (visionResult) {
      // 둘 다 불확실 → Vision 결과 (더 정확할 가능성 높음)
      keywordInfo = visionResult;
    } else {
      // Vision 실패 → Text 결과
      keywordInfo = textResult;
    }

    keyword = keywordInfo.main;
    coupangLink = generateCoupangLink(keyword, config.coupangPartnerCode);

    // 신뢰도 낮으면 추천 제품 여러 개 생성
    if (!keywordInfo.confident && keywordInfo.suggestions.length > 0) {
      coupangSuggestions = keywordInfo.suggestions.map(s => ({
        keyword: s,
        link: generateCoupangLink(s, config.coupangPartnerCode),
      }));
    }
  }

  // 9. 대본 파일 저장 (.txt)
  const transcriptPath = path.join(workDir, `output_${jobId}.txt`);
  try {
    const lines = [];
    lines.push('='.repeat(60));
    lines.push('쇼츠 리믹서 - 대본 및 번역');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`생성 시간: ${new Date().toLocaleString('ko-KR')}`);
    lines.push(`영상 타입: ${
      videoType === 'product' ? '제품 (광고 카피)' :
      videoType === 'story' ? '드라마 각본 (원본 재구성)' :
      videoType === 'reaction' ? '🎬 예능 썰 (하이라이트 추출 + 재구성)' :
      '인물 (자막 번역)'
    }`);
    lines.push(`원본 언어: ${LANGUAGES[detectedLang]?.name || detectedLang}`);
    lines.push(`번역 언어: ${LANGUAGES[targetLang]?.name || targetLang}`);
    lines.push(`모드: ${mode}`);
    lines.push(`원본 URL: ${url}`);
    if (keyword) {
      lines.push(`쿠팡 제품: ${keyword}${keywordInfo && !keywordInfo.confident ? ' (자동 감지 - 확인 필요)' : ''}`);
    }
    if (coupangLink) lines.push(`쿠팡 링크: ${coupangLink}`);
    if (coupangSuggestions.length > 0) {
      lines.push('');
      lines.push('추천 제품 (영상에서 명확히 파악 안 됨):');
      coupangSuggestions.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.keyword}`);
        lines.push(`     → ${s.link}`);
      });
    }
    lines.push('');

    if ((videoType === 'product' || videoType === 'story' || videoType === 'reaction') && adCopy) {
      lines.push('-'.repeat(60));
      lines.push(
        videoType === 'story' ? '[드라마 각본 (TTS 더빙 내용)]' :
        videoType === 'reaction' ? '[🎬 예능 썰 스크립트 (TTS 더빙 내용)]' :
        '[광고 카피 (TTS 더빙 내용)]'
      );
      lines.push('-'.repeat(60));
      lines.push(adCopy);
      lines.push('');

      // 드라마 모드: 화자 분포 요약
      if (videoType === 'story') {
        const scriptLines = adCopy.split('\n').map(l => l.trim()).filter(Boolean);
        const speakerCounts = {};
        scriptLines.forEach(line => {
          const m = line.match(/^\**\[(NARR|F[1-3]|M[1-3])\]/i);
          const sp = m ? m[1].toUpperCase() : 'NARR(태그없음)';
          speakerCounts[sp] = (speakerCounts[sp] || 0) + 1;
        });
        lines.push('[화자 분포 (드라마 각본)]');
        Object.entries(speakerCounts).forEach(([sp, cnt]) => {
          const label = {
            NARR: '나레이터', F1: '여자 청년', F2: '여자 성인', F3: '여자 노년',
            M1: '남자 청년', M2: '남자 성인', M3: '남자 중년',
          }[sp] || sp;
          lines.push(`  ${sp} (${label}): ${cnt}줄`);
        });
        lines.push('');
      }

      // 예능 썰 모드: 추출된 하이라이트 정보
      if (videoType === 'reaction' && config.__reactionHighlights) {
        lines.push('[하이라이트 추출 정보]');
        lines.push(`음성 처리: ${
          config.reactionAudioMode === 'hybrid' ? '🎯 하이브리드 (더빙 + 원본 믹스)' :
          config.reactionAudioMode === 'original' ? '🎤 원본 음성 유지 (자막만)' :
          '🤖 AI 더빙'
        }`);
        config.__reactionHighlights.forEach((h, i) => {
          const audioMark = h.keepOriginal ? '🎤원본살림' : '🤖더빙';
          lines.push(`  ${i + 1}. ${audioMark} ${h.start.toFixed(1)}~${h.end.toFixed(1)}초 (${(h.end - h.start).toFixed(1)}s)`);
          lines.push(`     이유: ${h.reason}`);
        });
        lines.push('');
      }
    }

    lines.push('-'.repeat(60));
    lines.push('[번역된 전체 스크립트]');
    lines.push('-'.repeat(60));
    lines.push(fullTranslation);
    lines.push('');

    // 원본 + 번역 나란히 (세그먼트별)
    if (transcription.segments && transcription.segments.length > 0 && translatedSegments.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('[세그먼트별 원문 / 번역 / 타임스탬프]');
      lines.push('-'.repeat(60));

      const origSegs = transcription.segments;
      for (let i = 0; i < Math.max(origSegs.length, translatedSegments.length); i++) {
        const orig = origSegs[i];
        const trans = translatedSegments[i];
        if (!orig && !trans) continue;

        const start = orig?.start ?? trans?.start ?? 0;
        const end = orig?.end ?? trans?.end ?? 0;
        const formatTime = (t) => {
          const m = Math.floor(t / 60);
          const s = Math.floor(t % 60);
          return `${m}:${String(s).padStart(2, '0')}`;
        };

        lines.push('');
        lines.push(`[${formatTime(start)} - ${formatTime(end)}]`);
        if (orig) lines.push(`원문: ${orig.text.trim()}`);
        if (trans) lines.push(`번역: ${trans.text.trim()}`);
      }
    }

    fs.writeFileSync(transcriptPath, lines.join('\n'), 'utf-8');
  } catch (e) {
    console.error('대본 저장 실패:', e);
  }

  onProgress('done', 100, '완료!');

  return {
    outputPath,
    transcriptPath,
    fullTranslation,
    keyword,
    coupangLink,
    coupangSuggestions,
    keywordConfident: keywordInfo ? keywordInfo.confident : true,
    mode,
    sourceLang: detectedLang,
    targetLang,
    sourceLangName: LANGUAGES[detectedLang]?.name || detectedLang,
    targetLangName: LANGUAGES[targetLang]?.name || targetLang,
  };
}

// ===== 🆕 쿠팡 파트너스 검색 기능 =====

// HMAC-SHA256 서명 생성 (쿠팡 API 인증용)
function _coupangSignature(method, urlPath, accessKey, secretKey) {
  const now = new Date();
  // 🔧 쿠팡 OpenAPI 정확한 datetime 형식: YYMMDDTHHMMSSZ (UTC 기준)
  const datetime = 
    now.getUTCFullYear().toString().substr(2, 2) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    'T' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    'Z';
  
  const [pathPart, queryPart = ''] = urlPath.split('?');
  const message = datetime + method + pathPart + queryPart;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const authHeader = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
  return authHeader;
}

// 쿠팡 상품 검색 (관리자 API 키 사용)
async function searchCoupangProducts(keyword, limit = 10, adminApiKeys = null) {
  if (!keyword || !keyword.trim()) {
    throw new Error('검색어를 입력하세요');
  }
  
  if (!adminApiKeys || !adminApiKeys.accessKey || !adminApiKeys.secretKey) {
    throw new Error('🔑 관리자 쿠팡 API 키가 설정되지 않았습니다\n\n관리자에게 문의하세요');
  }
  
  // 🔧 limit 안전 처리 (쿠팡 OpenAPI는 1~10 권장)
  let safeLimit = parseInt(limit);
  if (!safeLimit || isNaN(safeLimit) || safeLimit < 1) safeLimit = 10;
  if (safeLimit > 10) safeLimit = 10;  // 쿠팡 제한: 최대 10
  
  console.log('[Coupang] 검색 시작:', { keyword, limit: safeLimit });
  
  const encodedKeyword = encodeURIComponent(keyword.trim());
  const urlPath = `/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword=${encodedKeyword}&limit=${safeLimit}`;
  const fullUrl = 'https://api-gateway.coupang.com' + urlPath;
  const auth = _coupangSignature('GET', urlPath, adminApiKeys.accessKey, adminApiKeys.secretKey);
  
  // 🔧 디버그 - axios 호출 직전 모든 값 출력
  console.log('========================================');
  console.log('[Coupang] axios 호출 직전:');
  console.log('  fullUrl:', fullUrl);
  console.log('  encodedKeyword:', encodedKeyword);
  console.log('  safeLimit:', safeLimit);
  console.log('  keyword (raw):', keyword);
  console.log('  keyword char codes:', Array.from(keyword).map(c => c.charCodeAt(0)).join(','));
  console.log('========================================');
  
  try {
    const response = await axios.get(fullUrl, {
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      timeout: 15000,
    });
    
    // 🔧 응답 받은 직후 로그
    console.log('[Coupang] axios 응답 받음, status:', response.status);
    console.log('[Coupang] response.data:', JSON.stringify(response.data).substring(0, 200));
    
    if (response.data?.rCode !== '0') {
      throw new Error(response.data?.rMessage || '쿠팡 API 응답 오류');
    }
    
    const products = response.data?.data?.productData || [];
    
    // 🔧 첫 번째 상품 전체 출력 (디버깅 - 쿠팡이 진짜 뭘 보내는지)
    if (products.length > 0) {
      console.log('========================================');
      console.log('[Coupang] 첫 상품 raw 데이터:');
      console.log(JSON.stringify(products[0], null, 2));
      console.log('========================================');
    }
    
    return products.map(p => {
      // 🔧 productUrl이 단축 링크면 productId로 원본 URL 직접 생성
      // 쿠팡 검색 API는 단축 링크를 반환하는데, 이걸 deeplink API에 다시 넣으면 거부됨
      let cleanUrl = p.productUrl;
      if (p.productId && (
        !cleanUrl ||
        cleanUrl.includes('link.coupang.com/re/') ||  // 단축 링크
        cleanUrl.includes('ads-partners.coupang')      // 광고 링크
      )) {
        cleanUrl = `https://www.coupang.com/vp/products/${p.productId}`;
      }
      
      return {
        productId: p.productId,
        productName: p.productName,
        productPrice: p.productPrice,
        productImage: p.productImage,
        productUrl: cleanUrl,  // ← 원본 URL로 변환됨
        originalShortenUrl: p.productUrl,  // 원본도 저장 (참고용)
        categoryName: p.categoryName,
        isRocket: p.isRocket,
        isFreeShipping: p.isFreeShipping,
      };
    });
  } catch (error) {
    // 🔧 axios 에러 객체 통째로 dump
    console.error('========================================');
    console.error('[Coupang] axios 에러 객체 전체:');
    console.error('========================================');
    console.error('  error.message:', error.message);
    console.error('  error.code:', error.code);
    console.error('  error.name:', error.name);
    console.error('  error.response 있나?:', error.response ? '예' : '아니오');
    if (error.response) {
      console.error('  error.response.status:', error.response.status);
      console.error('  error.response.statusText:', error.response.statusText);
      console.error('  error.response.data:', JSON.stringify(error.response.data));
      console.error('  error.response.headers:', JSON.stringify(error.response.headers));
    }
    console.error('  error.request 있나?:', error.request ? '예' : '아니오');
    console.error('  error.config?.url:', error.config?.url);
    console.error('  error.config?.method:', error.config?.method);
    console.error('  error.stack:', error.stack);
    console.error('========================================');
    
    const status = error.response?.status;
    const responseData = error.response?.data;
    const errMsg = responseData?.rMessage || responseData?.message || error.message;
    
    // 🔧 상세 에러 로그 (디버깅용)
    console.error('========================================');
    console.error('[Coupang] 검색 오류 상세');
    console.error('========================================');
    console.error('  status:', status);
    console.error('  errMsg:', errMsg);
    console.error('  responseData:', JSON.stringify(responseData));
    console.error('  fullError:', error.message);
    console.error('========================================');
    
    if (status === 401 || status === 403) {
      throw new Error('🔒 쿠팡 API 인증 실패\n\n관리자 API 키가 잘못되었거나 만료되었습니다');
    } else if (status === 429) {
      throw new Error('⏱️ 쿠팡 API 호출 한도 초과\n\n잠시 후 다시 시도하세요');
    } else if (status === 400) {
      throw new Error(`⚠️ 쿠팡 검색 요청 오류\n\n${errMsg}`);
    } else if (!status) {
      // 🔧 응답 자체가 없을 때만 진짜 네트워크 오류
      // status는 없는데 errMsg에 "limit" 같은 게 있으면 사실 다른 문제
      if (errMsg && errMsg.includes('limit')) {
        throw new Error(`⚠️ 쿠팡 API 요청 오류: ${errMsg}`);
      }
      throw new Error('🌐 네트워크 연결 오류\n\n인터넷 연결을 확인하세요');
    } else {
      throw new Error(`쿠팡 검색 실패 (코드 ${status}): ${errMsg}`);
    }
  }
}

// 쿠팡 딥링크 발급 (사용자 본인 lptag만 사용, fallback 절대 X)
async function generateCoupangDeeplink(productUrl, userLptag, adminApiKeys = null) {
  if (!productUrl) throw new Error('상품 URL이 없습니다');
  if (!userLptag || !userLptag.trim()) {
    throw new Error('본인 추천 ID가 필요합니다\n\n설정에서 본인 쿠팡 파트너스 ID를 등록해주세요');
  }
  
  if (!adminApiKeys || !adminApiKeys.accessKey || !adminApiKeys.secretKey) {
    throw new Error('🔑 관리자 쿠팡 API 키가 설정되지 않았습니다');
  }
  
  // 🔧 검색 결과 URL이 이미 파트너스 링크면 원본 쿠팡 URL로 변환
  let cleanProductUrl = productUrl.trim();
  
  // 이미 파트너스 단축 링크면 그대로는 못 씀 → 원본 URL 추출 시도
  // (검색 결과의 productUrl은 보통 https://link.coupang.com/re/... 같은 형태)
  
  console.log('========================================');
  console.log('[Coupang] 딥링크 발급 시작:');
  console.log('  productUrl (원본):', productUrl);
  console.log('  cleanProductUrl:', cleanProductUrl);
  console.log('  userLptag:', userLptag);
  console.log('  userLptag.trim():', userLptag.trim());
  console.log('========================================');
  
  const urlPath = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
  const fullUrl = 'https://api-gateway.coupang.com' + urlPath;
  const auth = _coupangSignature('POST', urlPath, adminApiKeys.accessKey, adminApiKeys.secretKey);
  
  const body = { 
    coupangUrls: [cleanProductUrl],
    subId: userLptag.trim()
  };
  
  console.log('[Coupang] body:', JSON.stringify(body));
  
  try {
    const response = await axios.post(fullUrl, body, {
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      timeout: 15000,
    });
    
    console.log('[Coupang] 딥링크 응답 status:', response.status);
    console.log('[Coupang] 딥링크 response.data:', JSON.stringify(response.data));
    
    if (response.data?.rCode !== '0') {
      // 🔧 rCode가 0이 아니면 - 응답 자체에 에러 메시지 있음
      const apiErr = response.data?.rMessage || '쿠팡 딥링크 발급 실패';
      console.error('[Coupang] API 비즈니스 에러:', response.data);
      throw new Error(apiErr);
    }
    
    const result = response.data?.data?.[0];
    if (!result) throw new Error('딥링크 결과가 비어있습니다');
    
    console.log('[Coupang] ✅ 딥링크 발급 성공:', result);
    
    return {
      shortenUrl: result.shortenUrl,
      landingUrl: result.landingUrl,
      originalUrl: result.originalUrl,
    };
  } catch (error) {
    // 🔧 axios 에러 객체 통째로 dump
    console.error('========================================');
    console.error('[Coupang] 딥링크 axios 에러:');
    console.error('========================================');
    console.error('  error.message:', error.message);
    console.error('  error.code:', error.code);
    console.error('  error.response 있나?:', error.response ? '예' : '아니오');
    if (error.response) {
      console.error('  error.response.status:', error.response.status);
      console.error('  error.response.data:', JSON.stringify(error.response.data));
    }
    console.error('========================================');
    
    const status = error.response?.status;
    const responseData = error.response?.data;
    const errMsg = responseData?.rMessage || responseData?.message || error.message;
    
    if (status === 401 || status === 403) {
      throw new Error('🔒 쿠팡 API 인증 실패\n\n관리자 API 키를 확인하세요');
    } else if (status === 429) {
      throw new Error('⏱️ 쿠팡 API 호출 한도 초과\n\n잠시 후 다시 시도하세요');
    } else {
      throw new Error(`쿠팡 링크 발급 실패: ${errMsg}`);
    }
  }
}

module.exports = { processVideo, downloadVideo, transcribeAudio, LANGUAGES, VOICE_CATALOG, SUBTITLE_PRESETS, AVAILABLE_FONTS, SIZE_PRESETS, LLM_PROVIDERS, searchCoupangProducts, generateCoupangDeeplink };