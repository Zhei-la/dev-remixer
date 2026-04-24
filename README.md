# 쇼츠 리믹서 (ShortsRemixer)

틱톡 · 유튜브 · Douyin 영상을 **한국어 쇼핑 쇼츠**로 자동 변환하는 Electron 데스크탑 앱

## 🎯 기능

- ✅ URL만 붙여넣으면 완전 자동 (여러 개 일괄 처리)
- ✅ 자동 음성 인식 → 한국어 번역 → 쇼핑 내레이션화
- ✅ 한국어 TTS 더빙 (Edge TTS - 무료, 자연스러움)
- ✅ 9:16 세로 변환 + 상하 블러 레터박스
- ✅ 좌우반전 (원본 회피)
- ✅ 자동 자막 번인
- ✅ 워터마크 (채널명)
- ✅ 쿠팡 파트너스 링크 자동 생성 + 클립보드 복사

## 🛠 설치 (Windows 기준)

### 1. 필수 외부 도구 설치

```bash
# ffmpeg
winget install ffmpeg

# yt-dlp
winget install yt-dlp

# edge-tts (Python 필요)
pip install edge-tts
```

설치 확인:
```bash
ffmpeg -version
yt-dlp --version
edge-tts --list-voices | findstr ko-KR
```

### 2. Node.js 설치

https://nodejs.org 에서 LTS 버전 설치

### 3. 앱 실행

```bash
cd shorts-remixer
npm install
npm start
```

### 4. Groq API 키 발급 (무료)

1. https://console.groq.com 가입
2. API Keys → Create API Key
3. 앱 실행 후 "설정" 탭에 붙여넣기

## 📦 exe 파일로 빌드

```bash
npm run build:win
```

`dist/` 폴더에 설치 파일이 생성됩니다.

## 🎬 사용법

1. **설정 탭**에서 Groq API 키 + 쿠팡 파트너스 코드 저장
2. **영상 만들기 탭**에서 URL 붙여넣기 (여러 개 가능)
3. 원하는 옵션 토글
4. "작업 시작" 클릭
5. 결과물은 `내 영상/ShortsRemixer/` 폴더에 저장
6. 쿠팡 링크는 자동으로 클립보드에 복사됨

## 🔧 처리 파이프라인

```
URL 
  ↓ yt-dlp 다운로드
  ↓ ffmpeg 오디오 추출
  ↓ Groq Whisper STT (음성→텍스트, 원본 언어)
  ↓ Groq LLM 번역 (한국어 쇼핑 멘트로 재구성)
  ↓ Edge TTS 더빙 (ko-KR-SunHiNeural)
  ↓ ffmpeg 최종 합성:
     - 9:16 리사이즈
     - 상하 블러 레터박스
     - 좌우 반전
     - 한국어 자막 번인
     - 워터마크
     - TTS 오디오 입히기
  ↓ 쿠팡 파트너스 링크 생성
  완성!
```

## 💰 비용

- **Groq**: 완전 무료 (STT + 번역 모두)
- **Edge TTS**: 완전 무료
- **yt-dlp, ffmpeg**: 오픈소스, 무료
- **총 비용: 0원**

## 📁 프로젝트 구조

```
shorts-remixer/
├── package.json
├── src/
│   ├── main.js          # Electron 메인 프로세스
│   ├── preload.js       # IPC 브릿지
│   ├── renderer.html    # UI (단일 파일)
│   └── processor.js     # 핵심 처리 파이프라인
└── README.md
```
