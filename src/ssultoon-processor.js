// src/ssultoon-processor.js - 썰툰 모드 전용 프로세서
// 사진 + 자막 스크롤 영상 생성 (틱톡 썰 스타일)

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

// ===== Edge TTS 목소리 =====
const TTS_VOICES = {
  ko: {
    default: 'ko-KR-SunHiNeural',
    options: [
      { id: 'ko-KR-SunHiNeural', name: '선희', gender: 'F' },
      { id: 'ko-KR-InJoonNeural', name: '인준', gender: 'M' },
      { id: 'ko-KR-HyunsuNeural', name: '현수', gender: 'M' },
      { id: 'ko-KR-JiMinNeural', name: '지민', gender: 'F' },
    ],
  },
  en: {
    default: 'en-US-AriaNeural',
    options: [
      { id: 'en-US-AriaNeural', name: 'Aria', gender: 'F' },
      { id: 'en-US-GuyNeural', name: 'Guy', gender: 'M' },
    ],
  },
  ja: {
    default: 'ja-JP-NanamiNeural',
    options: [
      { id: 'ja-JP-NanamiNeural', name: 'Nanami', gender: 'F' },
      { id: 'ja-JP-KeitaNeural', name: 'Keita', gender: 'M' },
    ],
  },
};

// ===== 유틸 =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runCommand(cmd, args, onStderr) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      if (onStderr) onStderr(text);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr.slice(-1000)}`));
    });
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ===== Pollinations 이미지 생성 (무료) =====
async function generateImagePollinations(prompt, outputPath, width = 720, height = 1280) {
  // Pollinations.ai - 무료 AI 이미지 생성
  // URL 기반으로 이미지 요청
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;
  
  try {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 60000, // 60초 타임아웃
    });
    fs.writeFileSync(outputPath, response.data);
    return outputPath;
  } catch (error) {
    console.error('Pollinations 이미지 생성 실패:', error.message);
    throw error;
  }
}

// ===== AI 대본 생성 (Groq/OpenAI) =====
async function generateScript(topic, config, speechStyle = 'casual', category = 'funny') {
  // 설정에서 선택한 LLM Provider 우선 사용
  const provider = config.llmProvider || 'groq';
  
  // 사용 가능한 API 목록 (선택한 거 먼저, 그 다음 대체)
  const providers = [];
  if (provider === 'openai' && config.openaiApiKey) {
    providers.push({ key: config.openaiApiKey, isGroq: false, name: 'OpenAI' });
  }
  if (provider === 'groq' && config.groqApiKey) {
    providers.push({ key: config.groqApiKey, isGroq: true, name: 'Groq' });
  }
  // 대체 API 추가
  if (provider !== 'openai' && config.openaiApiKey) {
    providers.push({ key: config.openaiApiKey, isGroq: false, name: 'OpenAI' });
  }
  if (provider !== 'groq' && config.groqApiKey) {
    providers.push({ key: config.groqApiKey, isGroq: true, name: 'Groq' });
  }
  
  if (providers.length === 0) {
    throw new Error('Groq 또는 OpenAI API 키가 필요합니다. 설정에서 입력해주세요.');
  }
  
  let lastError = null;
  let usedProvider = null;
  let switched = false;
  
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      console.log(`[썰툰] ${p.name} API로 대본 생성 시도...`);
      const result = await generateScriptWithApi(topic, config, speechStyle, category, p.key, p.isGroq);
      usedProvider = p.name;
      switched = i > 0; // 첫 번째가 아니면 전환된 것
      
      // 전환 알림 추가
      if (switched) {
        const fromProvider = providers[0].name;
        result._switchedFrom = fromProvider;
        result._switchedTo = usedProvider;
        result._switchMessage = `⚠️ ${fromProvider} API 한도 초과로 ${usedProvider}로 자동 전환되었습니다.`;
      }
      
      return result;
    } catch (err) {
      console.log(`[썰툰] ${p.name} 실패: ${err.message}`);
      lastError = err;
      // 다음 API 시도
      continue;
    }
  }
  
  throw lastError || new Error('모든 API 요청 실패');
}

// 실제 API 호출 함수

// 실제 API 호출 함수
async function generateScriptWithApi(topic, config, speechStyle, category, apiKey, isGroq) {
  
  const lang = config.ssultoonLang || 'ko';
  
  const styleGuide = speechStyle === 'formal' 
    ? '존댓말 (~했어요, ~했습니다, ~인데요)' 
    : '음슴체/반말 (~했음, ~였는데, ~인듯, ~함, ~ㅋㅋ, ~ㄷㄷ)';
  
  // 언어 이름 매핑
  const langNames = {
    ko: '한국어', en: 'English', ja: '日本語', zh: '中文',
    es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano',
    pt: 'Português', ru: 'Русский', vi: 'Tiếng Việt', th: 'ภาษาไทย'
  };
  const langName = langNames[lang] || 'English';
  
  // 10개 카테고리별 구체적인 상황 예시
  const categoryGuides = {
    love: { 
      name: '연애 썰', 
      situations: [
        '썸타던 애한테 용기내서 고백했는데 우리 친구로 지내자 하더라',
        '소개팅 나갔는데 전 여친 절친이 앉아있더라',
        '매일 가던 편의점 알바생이 이뻐서 한 달간 매일 갔는데 알고보니 남자더라',
        '짝사랑하던 애가 내 친구한테 고백하는 거 교실에서 목격함',
        '카톡 단톡방에 고백 메시지 잘못 보냄'
      ]
    },
    funny: { 
      name: '웃긴/황당 썰', 
      situations: [
        '회사 유리문이 자동문인 줄 알고 우아하게 걸어갔다가 박치기함',
        '배달 음식 시켰는데 배달부가 내가 시킨 거 먹고 있더라',
        '친구 뒷담화하다가 뒤에 서있는 거 봄',
        '면접관한테 아버지라고 불러버림',
        '발표 중에 방귀 터졌는데 조용해서 다 들림'
      ]
    },
    school: { 
      name: '학교 썰', 
      situations: [
        '야자 빠지고 PC방 갔다가 담임 선생님이 옆자리에서 게임하고 계시더라',
        '시험 컨닝 쪽지 준비했는데 그게 시험 범위 아니었음',
        '선생님 욕하는데 교실 문이 열려있었고 복도에 서계셨음',
        '수업 시간에 졸다가 선생님이 부르셔서 대답했는데 다른 과목 답 말함',
        '짝사랑하던 애한테 쪽지 전달했는데 반 전체가 돌려봄'
      ]
    },
    work: { 
      name: '직장/알바 썰', 
      situations: [
        '회식에서 술 취해서 부장님한테 형 그 여자 왜 만나요 했다가 다음 날 인사팀 호출',
        '퇴사 메일 작성하다가 실수로 전체 발송함',
        '알바 첫날 금고 비번 물어봤다가 털범으로 신고당함',
        '사장님 욕하는데 CCTV에 마이크 있는 거 몰랐음',
        '진상 손님한테 존댓말로 욕하는 법 시전함'
      ]
    },
    family: { 
      name: '가족 썰', 
      situations: [
        '여자친구 몰래 집에 데려왔는데 부모님이 일찍 들어오셔서 옷장에 숨김 3시간',
        '아버지 폰에서 내 유튜브 시청 기록 발견하심',
        '형 여자친구인 줄 모르고 카페에서 번호 땄다가 명절에 인사함',
        '엄마 카드로 게임 300만원 과금한 거 카드 명세서에서 발각됨',
        '친척 모임에서 대학 어디 가냐 했는데 재수생인 거 들킴'
      ]
    },
    friend: { 
      name: '친구 썰', 
      situations: [
        '10년 절친이 뒤에서 내 욕하는 거 우연히 들음',
        '친구한테 100만원 빌려줬는데 잠수 타버림',
        '베프인 줄 알았는데 나만 베프라고 생각한 거였음',
        '절교했던 친구랑 5년 만에 소개팅에서 만남',
        '친구 소개팅 주선해줬는데 그 사람이 나한테 관심 있었음'
      ]
    },
    scary: { 
      name: '소름/무서운 썰', 
      situations: [
        '새벽 3시에 혼자 있는데 현관 비밀번호 누르는 소리 들림',
        '이사 온 집에서 벽장 열었는데 사람 눈 모양 구멍이 있더라',
        '꿈에서 본 장소를 여행 가서 실제로 발견함',
        '폐건물 탐험하다가 누가 쫓아오는 발소리 들림',
        '혼자 찍은 셀카에 뒤에 얼굴이 있었음'
      ]
    },
    revenge: { 
      name: '사이다/복수 썰', 
      situations: [
        '학교 다닐 때 맨날 괴롭히던 애가 면접 볼 때 내가 면접관으로 앉아있었음',
        '진상 손님이 사장 불러오라 해서 갔다 왔더니 내가 사장임',
        '내 뒷담 까던 애 앞에서 일부러 크게 전화 받으면서 연봉 말함',
        '차였던 전 여친이 재회 요청했는데 그때 내 옆에 여자친구 있었음',
        '무시하던 사람들 동창회에서 테슬라 타고 감'
      ]
    },
    touching: { 
      name: '감동/슬픈 썰', 
      situations: [
        '할머니 돌아가시기 전 마지막으로 하신 말씀이 밥은 먹었냐였음',
        '아버지가 평생 한 번도 사랑한다 안 하시다가 수술 전에 처음 말씀하심',
        '버스에서 우는데 모르는 할머니가 조용히 손 잡아주심',
        '헤어진 지 1년 됐는데 전 여친이 내 생일에 편지 보냄',
        '힘들 때 연락 안 했던 친구가 알고보니 매일 내 SNS 확인하고 있었음'
      ]
    },
    daily: { 
      name: '일상/여행 썰', 
      situations: [
        '지하철에서 연예인 닮은 사람 쳐다봤는데 진짜 그 연예인이었음',
        '해외여행에서 한국인한테 가이드비 받고 도망감',
        '카페에서 옆 테이블 커플 싸움 구경하다가 눈 마주침',
        '택시 타고 가는데 기사님이 내 전 직장 사장님이셨음',
        '마트에서 장 보는데 전 여친이랑 그 남친이랑 같이 옴'
      ]
    }
  };
  
  const guide = categoryGuides[category] || categoryGuides.funny;
  
  // 결말 유형 랜덤
  const endingTypes = ['소름 돋는 반전', '훈훈한 결말', '허탈한 결말', '통쾌한 사이다', '공감 100%', '예상 못한 전개', '웃긴 마무리'];
  const randomEnding = endingTypes[Math.floor(Math.random() * endingTypes.length)];
  
  // 랜덤 상황 선택
  const randomSituation = guide.situations[Math.floor(Math.random() * guide.situations.length)];
  
  // 언어별 프롬프트 분기
  let prompt;
  
  if (lang === 'ko') {
    // 한국어 프롬프트
    prompt = `너는 "유튜브 쇼츠용 썰을 자연스럽게 풀어주는 스토리 생성기"다.

목표:
- 실제 사람이 말하듯 자연스럽게
- 매번 완전히 다른 이야기 생성 (중복률 10% 이하)
- 30초 ~ 1분30초 분량

────────────────────
[핵심 시스템]
────────────────────
- 선택 없이 바로 썰 생성
- 주제는 내부적으로 랜덤 선택
- 카테고리 힌트: ${guide.name}
- 상황 힌트: ${randomSituation}
- 말투: ${styleGuide}

────────────────────
[자막 분할 핵심 규칙]
────────────────────
- 모든 문장은 자막처럼 끊는다
- 한 스텝 = 짧은 호흡 1번

────────────────────
[문법 규칙]
────────────────────
- 주어 + 동사 절대 분리 금지

❌
- 애들
- 쳐다봄

⭕
- 애들이 쳐다봄

────────────────────
[길이 제한]
────────────────────
- 한 줄 10~14자
- 길면 반드시 분할

────────────────────
[분할 방식]
────────────────────
❌
- 교실 들어가자마자 애들 다 나 쳐다봄

⭕
- 교실 들어갔는데
- 애들 다 나 쳐다봄

────────────────────
[페이지 규칙]
────────────────────
- 8~18페이지
- 페이지당 3~5스텝

────────────────────
[스토리 규칙]
────────────────────
- 사건 중심
- 중간에 반드시 터지는 사건
- 갈등 / 들킴 포함

────────────────────
[결말 규칙]
────────────────────
- 마지막 2페이지:
→ 결과 + 현재 상태

────────────────────
[스타일]
────────────────────
- 썰 풀듯이 시작
- 설명 금지

────────────────────
[출력 형식 - JSON만]
────────────────────
{
  "title": "제목 (호기심 유발)",
  "pages": [
    {
      "steps": [
        { "text": "고3때 있었던 일인데", "speaker": "narrator", "imagePrompt": "high school classroom" },
        { "text": "야자 빠지고", "speaker": "narrator", "imagePrompt": "student sneaking out" },
        { "text": "PC방 갔었음", "speaker": "narrator", "imagePrompt": "pc room gaming" }
      ]
    }
  ]
}

화자 종류:
- narrator: 나레이션/상황
- me_m: 나(남자) 대사
- me_f: 나(여자) 대사
- other_m: 상대 남자 대사
- other_f: 상대 여자 대사

────────────────────
[최종 목표]
────────────────────
- "이거 실화냐?" 느낌
- 끝까지 보게 만들기`;

  } else {
    // 외국어 프롬프트 (외국어 + 한국어 번역)
    prompt = `너는 "유튜브 쇼츠용 짧은 썰을 생성하는 스토리 생성기"다.

목표:
- 실제 사람이 말해주는 것처럼 자연스럽게
- 매번 완전히 다른 이야기 생성
- 30초 ~ 1분30초 분량

────────────────────
[핵심 시스템]
────────────────────
- 선택 없이 바로 썰 생성
- 주제는 내부적으로 랜덤 선택
- 카테고리 힌트: ${guide.name}
- 상황 힌트: ${randomSituation}

────────────────────
[생성 언어 시스템]
────────────────────
- 썰은 ${langName}로 생성
- 이후 한국어 번역을 translation 필드에 함께 출력

────────────────────
[자막 분할 핵심 규칙]
────────────────────
- 모든 문장은 자막처럼 끊는다
- 한 스텝 = 짧은 호흡 1번

────────────────────
[문법 규칙]
────────────────────
- 주어 + 동사 절대 분리 금지

❌
- people
- were looking

⭕
- people were looking

────────────────────
[길이 제한]
────────────────────
- 한 줄 10~15단어 이하
- 길면 반드시 분할

────────────────────
[분할 방식]
────────────────────
❌
- I walked into the classroom and everyone stared at me

⭕
- I walked in
- and everyone
- stared at me

────────────────────
[페이지 규칙]
────────────────────
- 8~18페이지
- 페이지당 3~5스텝

────────────────────
[스토리 규칙]
────────────────────
- 사건 중심
- 터지는 사건 포함
- 갈등 / 들킴 포함

────────────────────
[결말 규칙]
────────────────────
- 마지막 2페이지:
→ 결과 + 현재 상태

────────────────────
[스타일]
────────────────────
- 썰 풀듯이
- 설명 금지

────────────────────
[출력 형식 - JSON만]
────────────────────
{
  "title": "제목 (${langName})",
  "titleKo": "제목 (한국어 번역)",
  "pages": [
    {
      "steps": [
        { "text": "${langName}로 된 내용", "translation": "한국어 번역", "speaker": "narrator", "imagePrompt": "image description" }
      ]
    }
  ]
}

화자 종류:
- narrator: 나레이션/상황
- me_m: 나(남자) 대사
- me_f: 나(여자) 대사
- other_m: 상대 남자 대사
- other_f: 상대 여자 대사

────────────────────
[중요]
────────────────────
- 모든 step에 text(${langName})와 translation(한국어) 둘 다 포함
- 1:1 구조 유지

────────────────────
[최종 목표]
────────────────────
- "이거 실화냐?"
- 끝까지 보게 만들기`;
  }

  const endpoint = isGroq 
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  
  const model = isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
  
  const response = await axios.post(endpoint, {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    max_tokens: 4000,
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  
  const content = response.data.choices[0].message.content;
  
  // JSON 파싱
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 형식 응답 없음');
    const parsed = JSON.parse(jsonMatch[0]);
    
    // 새 형식(pages) → 기존 형식(steps) 변환
    if (parsed.pages) {
      return parsed;
    } else if (parsed.steps) {
      const pages = [];
      for (let i = 0; i < parsed.steps.length; i += 4) {
        pages.push({ steps: parsed.steps.slice(i, i + 4) });
      }
      return { title: parsed.title, pages };
    }
    
    return parsed;
  } catch (e) {
    console.error('대본 파싱 실패:', content);
    throw new Error('AI 대본 파싱 실패: ' + e.message);
  }
}
// ===== 말투 변환 (반말 ↔ 존댓말) =====
async function convertSpeechStyle(pages, targetStyle, config) {
  // 설정에서 선택한 LLM Provider 사용
  const provider = config.llmProvider || 'groq';
  
  // 사용 가능한 API 목록
  const providers = [];
  if (provider === 'openai' && config.openaiApiKey) {
    providers.push({ key: config.openaiApiKey, isGroq: false });
  }
  if (provider === 'groq' && config.groqApiKey) {
    providers.push({ key: config.groqApiKey, isGroq: true });
  }
  if (provider !== 'openai' && config.openaiApiKey) {
    providers.push({ key: config.openaiApiKey, isGroq: false });
  }
  if (provider !== 'groq' && config.groqApiKey) {
    providers.push({ key: config.groqApiKey, isGroq: true });
  }
  
  if (providers.length === 0) {
    throw new Error('API 키가 필요합니다.');
  }
  
  const apiKey = providers[0].key;
  const isGroq = providers[0].isGroq;
  
  // 모든 텍스트 추출
  const allTexts = [];
  pages.forEach((page, pIdx) => {
    page.steps.forEach((step, sIdx) => {
      allTexts.push({ pIdx, sIdx, text: step.text });
    });
  });
  
  const styleDesc = targetStyle === 'formal' 
    ? '존댓말 (~했어요, ~인데요, ~했습니다)' 
    : '음슴체/반말 (~했음, ~였는데, ~인듯, ~함)';
  
  const prompt = `다음 대사들을 ${styleDesc}로 변환해주세요.
글자 수는 최대한 유지하고, 의미는 그대로 유지하세요.
JSON 배열로만 출력하세요.

입력: ${JSON.stringify(allTexts.map(t => t.text))}

출력 형식: ["변환된 대사1", "변환된 대사2", ...]`;

  const endpoint = isGroq 
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  
  const model = isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
  
  const response = await axios.post(endpoint, {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  
  const content = response.data.choices[0].message.content;
  
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('JSON 배열 형식 응답 없음');
    const converted = JSON.parse(jsonMatch[0]);
    
    // 변환된 텍스트 적용
    const newPages = JSON.parse(JSON.stringify(pages)); // 깊은 복사
    allTexts.forEach((t, idx) => {
      if (converted[idx]) {
        newPages[t.pIdx].steps[t.sIdx].text = converted[idx];
      }
    });
    
    return newPages;
  } catch (e) {
    console.error('말투 변환 실패:', content);
    throw new Error('말투 변환 실패: ' + e.message);
  }
}

// ===== Edge TTS 음성 생성 =====
async function generateTTS(text, outputPath, voice = 'ko-KR-SunHiNeural', rate = '+0%') {
  // edge-tts 명령어 사용 (pip install edge-tts)
  const edgeTts = process.platform === 'win32' ? 'edge-tts' : 'edge-tts';
  
  try {
    await runCommand(edgeTts, [
      '--voice', voice,
      '--rate', rate,
      '--text', text,
      '--write-media', outputPath,
    ]);
    return outputPath;
  } catch (error) {
    // edge-tts가 없으면 에러 메시지
    if (error.message.includes('ENOENT')) {
      throw new Error('edge-tts가 설치되지 않았습니다. "pip install edge-tts"를 실행하세요.');
    }
    throw error;
  }
}

// ===== 오디오 길이 측정 =====
async function getAudioDuration(audioPath) {
  const ffprobe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  
  try {
    const result = await runCommand(ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);
    return parseFloat(result.stdout.trim());
  } catch (e) {
    console.error('오디오 길이 측정 실패:', e);
    return 5; // 기본값 5초
  }
}

// ===== 이미지 리사이즈 (9:16) =====
async function resizeImage(inputPath, outputPath, width = 1080, height = 1920) {
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  await runCommand(ffmpeg, [
    '-y', '-i', inputPath,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    '-q:v', '2',
    outputPath,
  ]);
  
  return outputPath;
}

// ===== 스크롤 스타일 썰툰 영상 생성 =====
// 자막이 위에서 아래로 쌓이고, 이미지는 자막 밑에 붙어서 같이 밀려남
async function createScrollStyleVideo(steps, workDir, config, onProgress) {
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const fontFile = process.platform === 'win32' 
    ? 'C\\:/Windows/Fonts/malgun.ttf' 
    : '/usr/share/fonts/truetype/nanum/NanumGothic.ttf';
  
  // 1. 각 스텝별 TTS 생성 + 길이 측정
  const stepData = [];
  let totalDuration = 0;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const audioPath = path.join(workDir, `step_${i + 1}_audio.mp3`);
    
    onProgress('ssultoon', 30 + i * 5, `스텝 ${i + 1}: TTS 생성 중...`);
    
    // 언어별 TTS 음성 자동 선택
    const langVoices = {
      ko: 'ko-KR-SunHiNeural',
      en: 'en-US-AriaNeural',
      ja: 'ja-JP-NanamiNeural',
      zh: 'zh-CN-XiaoxiaoNeural',
      es: 'es-ES-ElviraNeural',
      fr: 'fr-FR-DeniseNeural',
      de: 'de-DE-KatjaNeural',
      it: 'it-IT-ElsaNeural',
      pt: 'pt-BR-FranciscaNeural',
      ru: 'ru-RU-SvetlanaNeural',
      vi: 'vi-VN-HoaiMyNeural',
      th: 'th-TH-PremwadeeNeural',
    };
    const ttsVoice = config.ttsVoice || langVoices[config.ssultoonLang] || 'ko-KR-SunHiNeural';
    await generateTTS(step.text, audioPath, ttsVoice);
    
    const duration = await getAudioDuration(audioPath);
    
    stepData.push({
      ...step,
      audioPath,
      duration,
      startTime: totalDuration,
    });
    
    totalDuration += duration + 0.3; // 스텝 간 0.3초 간격
  }
  
  // 2. 오디오 합치기
  onProgress('ssultoon', 60, '오디오 합치는 중...');
  const audioListPath = path.join(workDir, 'audio_list.txt');
  const audioListContent = stepData.map(s => `file '${s.audioPath.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(audioListPath, audioListContent);
  
  const combinedAudioPath = path.join(workDir, 'combined_audio.mp3');
  await runCommand(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', audioListPath,
    '-c', 'copy',
    combinedAudioPath,
  ]);
  
  // 3. 배경 + 템플릿 제목 이미지 생성
  const bgPath = path.join(workDir, 'background.png');
  const templateBg = config.templateBackground;
  const titleText = config.templateTitle || '';
  const titleY = config.templateTitleY || 8;
  const titleFontSize = config.templateTitleFontSize || 48;
  const titleColor = config.templateTitleColor || 'white';
  
  if (templateBg && fs.existsSync(templateBg)) {
    // 템플릿 배경 사용
    await runCommand(ffmpeg, [
      '-y', '-i', templateBg,
      '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`,
      bgPath,
    ]);
  } else {
    // 검은 배경
    await runCommand(ffmpeg, [
      '-y', '-f', 'lavfi',
      '-i', 'color=c=black:s=1080x1920:d=1',
      '-frames:v', '1',
      bgPath,
    ]);
  }
  
  // 4. 각 스텝별 프레임 생성 (자막+이미지가 위에서 쌓이는 형태)
  onProgress('ssultoon', 70, '영상 프레임 생성 중...');
  
  const frameDir = path.join(workDir, 'frames');
  ensureDir(frameDir);
  
  const fps = 30;
  const subtitleY = config.subtitleY || 15; // 자막 시작 Y 위치 (%)
  const subtitleFontSize = config.subtitleSize || 36;
  const subtitleColor = config.subtitleColor || 'white';
  const subtitleStroke = config.subtitleStroke || 'black';
  const imageHeight = config.imageHeight || 300; // 이미지 높이 (px)
  const lineHeight = subtitleFontSize + 20; // 자막 줄 높이
  const imageGap = 10; // 이미지와 자막 간격
  
  // 각 스텝이 등장하는 시점의 프레임 생성
  const keyframes = [];
  
  for (let stepIdx = 0; stepIdx < stepData.length; stepIdx++) {
    const currentStep = stepData[stepIdx];
    const frameNum = Math.floor(currentStep.startTime * fps);
    
    // 이 시점까지의 모든 자막+이미지를 쌓아서 그림
    const framePath = path.join(frameDir, `frame_${String(frameNum).padStart(6, '0')}.png`);
    
    // 지금까지 쌓인 자막+이미지들
    const visibleSteps = stepData.slice(0, stepIdx + 1);
    
    // FFmpeg 필터 생성 (배경 위에 자막+이미지 overlay)
    let filterParts = [`[0:v]scale=1080:1920[bg]`];
    let currentY = Math.floor(1920 * (subtitleY / 100)); // 시작 Y 위치
    let inputIdx = 1;
    let lastOutput = 'bg';
    
    for (let i = 0; i < visibleSteps.length; i++) {
      const vs = visibleSteps[i];
      const escapedText = vs.text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\''")
        .replace(/:/g, '\\:');
      
      // 자막 그리기
      filterParts.push(
        `[${lastOutput}]drawtext=fontfile='${fontFile}':text='${escapedText}':fontsize=${subtitleFontSize}:fontcolor=${subtitleColor}:borderw=2:bordercolor=${subtitleStroke}:x=(w-text_w)/2:y=${currentY}[txt${i}]`
      );
      lastOutput = `txt${i}`;
      currentY += lineHeight;
      
      // 이미지 overlay (있으면)
      if (vs.imagePath && fs.existsSync(vs.imagePath)) {
        filterParts.push(
          `[${inputIdx}:v]scale=-1:${imageHeight}[img${i}]`,
          `[${lastOutput}][img${i}]overlay=(W-w)/2:${currentY}[ov${i}]`
        );
        lastOutput = `ov${i}`;
        inputIdx++;
        currentY += imageHeight + imageGap;
      }
    }
    
    // 제목 추가 (맨 위에)
    if (titleText) {
      const escapedTitle = titleText
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\''")
        .replace(/:/g, '\\:')
        .replace(/\[\[(.+?)\]\]/g, '$1'); // 강조 태그 제거 (FFmpeg에서 처리 어려움)
      
      filterParts.push(
        `[${lastOutput}]drawtext=fontfile='${fontFile}':text='${escapedTitle}':fontsize=${titleFontSize}:fontcolor=${titleColor}:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${Math.floor(1920 * titleY / 100)}[final]`
      );
      lastOutput = 'final';
    }
    
    // 입력 파일 목록
    const inputs = ['-i', bgPath];
    for (let i = 0; i < visibleSteps.length; i++) {
      if (visibleSteps[i].imagePath && fs.existsSync(visibleSteps[i].imagePath)) {
        inputs.push('-i', visibleSteps[i].imagePath);
      }
    }
    
    // 프레임 생성
    await runCommand(ffmpeg, [
      '-y',
      ...inputs,
      '-filter_complex', filterParts.join(';'),
      '-map', `[${lastOutput}]`,
      '-frames:v', '1',
      framePath,
    ]);
    
    keyframes.push({
      frameNum,
      framePath,
      duration: currentStep.duration + 0.3,
    });
  }
  
  // 5. 키프레임들을 영상으로 합성
  onProgress('ssultoon', 85, '최종 영상 합성 중...');
  
  const outputPath = path.join(workDir, 'ssultoon_output.mp4');
  
  // 각 키프레임을 해당 duration만큼 보여주는 영상 생성
  const segmentPaths = [];
  
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const segmentPath = path.join(workDir, `segment_${i}.mp4`);
    
    await runCommand(ffmpeg, [
      '-y',
      '-loop', '1', '-i', kf.framePath,
      '-t', String(kf.duration),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      segmentPath,
    ]);
    
    segmentPaths.push(segmentPath);
  }
  
  // 세그먼트 합치기
  const segmentListPath = path.join(workDir, 'segment_list.txt');
  const segmentListContent = segmentPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(segmentListPath, segmentListContent);
  
  const videoOnlyPath = path.join(workDir, 'video_only.mp4');
  await runCommand(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', segmentListPath,
    '-c', 'copy',
    videoOnlyPath,
  ]);
  
  // 오디오 합성
  await runCommand(ffmpeg, [
    '-y',
    '-i', videoOnlyPath,
    '-i', combinedAudioPath,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    outputPath,
  ]);
  
  return outputPath;
}

// ===== 단일 스텝 영상 생성 (기존 방식 - 백업용) =====
async function createStepVideo(step, stepIdx, workDir, config, onProgress) {
  const { text, imagePath, duration } = step;
  const stepNum = stepIdx + 1;
  
  // 파일 경로
  const audioPath = path.join(workDir, `step_${stepNum}_audio.mp3`);
  const videoPath = path.join(workDir, `step_${stepNum}.mp4`);
  
  // 1. TTS 생성
  onProgress('ssultoon', 20 + stepIdx * 10, `스텝 ${stepNum}: TTS 생성 중...`);
  await generateTTS(text, audioPath, config.ttsVoice || 'ko-KR-SunHiNeural');
  
  // 2. 오디오 길이 측정
  const audioDuration = await getAudioDuration(audioPath);
  const videoDuration = audioDuration + 0.5; // 여유 0.5초
  
  // 3. 자막 스타일 설정
  const subtitleStyle = {
    font: config.subtitleFont || 'Pretendard',
    fontSize: config.subtitleSize || 48,
    color: config.subtitleColor || 'white',
    strokeColor: config.subtitleStroke || 'black',
    strokeWidth: 3,
    position: config.subtitlePosition || 'center',
  };
  
  // 자막 Y 위치
  const yPosition = {
    top: 'h*0.15',
    center: 'h*0.75',
    bottom: 'h*0.85',
  }[subtitleStyle.position];
  
  // 자막 텍스트 이스케이프
  const escapedText = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/\n/g, '\\N');
  
  // 4. FFmpeg으로 영상 생성
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  // drawtext 필터
  const fontFile = process.platform === 'win32' 
    ? 'C\\:/Windows/Fonts/malgun.ttf' 
    : '/usr/share/fonts/truetype/nanum/NanumGothic.ttf';
  
  const filterComplex = [
    // 이미지를 영상으로 (duration 동안)
    `[0:v]loop=loop=-1:size=1:start=0,trim=duration=${videoDuration},fps=30[img]`,
    // 자막 추가
    `[img]drawtext=fontfile='${fontFile}':text='${escapedText}':fontsize=${subtitleStyle.fontSize}:fontcolor=${subtitleStyle.color}:borderw=${subtitleStyle.strokeWidth}:bordercolor=${subtitleStyle.strokeColor}:x=(w-text_w)/2:y=${yPosition}[v]`,
  ].join(';');
  
  await runCommand(ffmpeg, [
    '-y',
    '-loop', '1', '-i', imagePath,
    '-i', audioPath,
    '-filter_complex', filterComplex,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-pix_fmt', 'yuv420p',
    videoPath,
  ]);
  
  return {
    videoPath,
    duration: audioDuration,
  };
}

// ===== 영상 합치기 =====
async function concatenateVideos(videoPaths, outputPath, workDir) {
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  // concat 파일 생성
  const concatFile = path.join(workDir, 'concat.txt');
  const concatContent = videoPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent);
  
  await runCommand(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    outputPath,
  ]);
  
  return outputPath;
}

// ===== 메인 처리 함수 =====
async function processSsultoon(config, onProgress) {
  const jobId = Date.now();
  const workDir = config.workDir || path.join(require('os').tmpdir(), `ssultoon_${jobId}`);
  ensureDir(workDir);
  
  onProgress('ssultoon', 0, '썰툰 생성 시작...');
  
  try {
    let steps = [];
    
    // 1. 대본 준비
    if (config.mode === 'auto') {
      // AI 자동 생성 모드
      onProgress('ssultoon', 5, 'AI 대본 생성 중...');
      const script = await generateScript(config.topic, config, config.stepCount || 5);
      
      steps = script.steps.map((s, i) => ({
        text: s.text,
        imagePrompt: s.imagePrompt,
        imagePath: null,
        imageSource: config.imageSource || 'ai',
      }));
      
      config.generatedTitle = script.title;
    } else {
      // 수동 모드 - 이미 steps 배열이 config에 있음
      steps = config.steps.map(s => ({
        text: s.text,
        imagePath: s.image || null,
        imageSource: s.imageSource || 'upload',
        imagePrompt: null,
      }));
    }
    
    // 2. 이미지 준비
    onProgress('ssultoon', 10, '이미지 준비 중...');
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNum = i + 1;
      
      if (step.imagePath && fs.existsSync(step.imagePath)) {
        // 이미 업로드된 이미지 - 리사이즈만
        const resizedPath = path.join(workDir, `step_${stepNum}_img.jpg`);
        await resizeImage(step.imagePath, resizedPath);
        step.imagePath = resizedPath;
      } else if (step.imageSource === 'ai' || !step.imagePath) {
        // AI 이미지 생성
        onProgress('ssultoon', 10 + i * 2, `스텝 ${stepNum}: AI 이미지 생성 중...`);
        
        const imgPath = path.join(workDir, `step_${stepNum}_img.jpg`);
        const prompt = step.imagePrompt || `Scene for: ${step.text.substring(0, 100)}, digital illustration, korean webtoon style`;
        
        try {
          await generateImagePollinations(prompt, imgPath);
          step.imagePath = imgPath;
        } catch (e) {
          console.error(`스텝 ${stepNum} 이미지 생성 실패:`, e);
          // 실패 시 단색 배경 이미지 생성
          await createFallbackImage(imgPath);
          step.imagePath = imgPath;
        }
      } else if (config.singleImage && i > 0) {
        // 대표 이미지 모드 - 첫 번째 이미지를 계속 사용
        step.imagePath = steps[0].imagePath;
      }
    }
    
    // 3. 스크롤 스타일 영상 생성 (자막+이미지가 위에서 아래로 쌓임)
    onProgress('ssultoon', 25, '영상 생성 중...');
    
    const outputFilename = `ssultoon_${jobId}.mp4`;
    const outputPath = path.join(config.outputDir || workDir, outputFilename);
    
    const videoPath = await createScrollStyleVideo(steps, workDir, config, onProgress);
    
    // 출력 경로로 복사
    if (videoPath !== outputPath) {
      fs.copyFileSync(videoPath, outputPath);
    }
    
    // 4. 정리
    onProgress('ssultoon', 100, '완료!');
    
    return {
      success: true,
      outputPath,
      title: config.generatedTitle || '썰툰',
      stepCount: steps.length,
    };
    
  } catch (error) {
    console.error('썰툰 생성 실패:', error);
    onProgress('error', 0, error.message);
    throw error;
  }
}

// ===== 대체 이미지 생성 (AI 실패 시) =====
async function createFallbackImage(outputPath) {
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  // 단색 그라데이션 배경
  await runCommand(ffmpeg, [
    '-y', '-f', 'lavfi',
    '-i', 'color=c=#1a1a2e:s=1080x1920:d=1',
    '-frames:v', '1',
    outputPath,
  ]);
  
  return outputPath;
}

// ===== 랜덤 주제 추천 =====
function getRandomTopics() {
  const topics = [
    '회사에서 있었던 황당한 에피소드',
    '소개팅에서 생긴 웃긴 일',
    '여행 중 겪은 무서운 경험',
    '친구한테 배신당한 썰',
    '가장 창피했던 순간',
    '우연히 연예인 만난 이야기',
    '알바할 때 진상 손님 썰',
    '술자리에서 생긴 대참사',
    '부모님 몰래 했다가 들킨 썰',
    '첫 월급으로 한 어이없는 짓',
  ];
  
  // 랜덤으로 3개 선택
  const shuffled = topics.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
}

module.exports = {
  processSsultoon,
  generateScript,
  generateTTS,
  generateImagePollinations,
  convertSpeechStyle,
  getRandomTopics,
  TTS_VOICES,
};
