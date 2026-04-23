// src/preload.js - IPC 브릿지 (썰툰 모드 추가)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 설정
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // 영상 처리 (기존)
  processVideo: (payload) => ipcRenderer.invoke('process-video', payload),
  cancelVideo: (jobId) => ipcRenderer.invoke('cancel-video', jobId),
  openWorkFolder: () => ipcRenderer.invoke('open-work-folder'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  getVideoDuration: (filePath) => ipcRenderer.invoke('get-video-duration', filePath),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getVoiceCatalog: () => ipcRenderer.invoke('get-voice-catalog'),
  getBuildInfo: () => ipcRenderer.invoke('get-build-info'),
  getTrialCount: () => ipcRenderer.invoke('get-trial-count'),
  getUserTier: () => ipcRenderer.invoke('get-user-tier'),
  onProgress: (callback) => {
    ipcRenderer.on('progress-update', (_, data) => callback(data));
  },

  // 썰툰 모드 (신규)
  processSsultoon: (payload) => ipcRenderer.invoke('process-ssultoon', payload),
  generateSsultoonScript: (topic, speechStyle, storyType, lang) => ipcRenderer.invoke('generate-ssultoon-script', topic, speechStyle, storyType, lang),
  generateSsultoonTitle: (topic) => ipcRenderer.invoke('generate-ssultoon-title', topic),
  convertSpeechStyle: (pages, targetStyle) => ipcRenderer.invoke('convert-speech-style', pages, targetStyle),
  generateSsultoonImage: (prompt, referenceImage) => ipcRenderer.invoke('generate-ssultoon-image', prompt, referenceImage),
  translatePrompt: (prompt) => ipcRenderer.invoke('translate-prompt', prompt),
  getRandomTopics: () => ipcRenderer.invoke('get-random-topics'),
  generateTitle: (script, category) => ipcRenderer.invoke('generate-title', script, category),
  
  // 내장 BGM 경로
  getBuiltinBgmPath: (filename) => ipcRenderer.invoke('get-builtin-bgm-path', filename),
  
  // 제품 대본 생성
  generateProductScript: (params) => ipcRenderer.invoke('generate-product-script', params),
  
  // 🆕 영상 분석 + 대본 생성 (URL에서 음성 추출 후)
  analyzeAndGenerateScript: (params) => ipcRenderer.invoke('analyze-and-generate-script', params),
  
  // 🆕 인물 영상 대본 추출 + 번역
  extractAndTranslateScript: (videoUrl, targetLang) => ipcRenderer.invoke('extract-and-translate-script', videoUrl, targetLang),
  
  // 🆕 인물 대본 추출 진행 상황 수신
  onTalkingScriptProgress: (callback) => {
    ipcRenderer.on('talking-script-progress', (_, data) => callback(data));
  },
  
  // 🆕 대본 생성 진행 상황 수신
  onScriptGenerationProgress: (callback) => {
    ipcRenderer.on('script-generation-progress', (_, data) => callback(data));
  },
  
  // 🆕 제품 대본 확정 (이벤트 방식)
  confirmProductScript: (jobId, confirmedScript) => {
    ipcRenderer.send('script-confirmed', { jobId, confirmedScript });
  },
  
  // 🆕 대본 편집 요청 수신
  onShowScriptEditor: (callback) => {
    ipcRenderer.on('show-script-editor', (_, data) => callback(data));
  },

  // 파일 선택
  selectFiles: (options) => ipcRenderer.invoke('select-files', options),
  selectImage: () => ipcRenderer.invoke('select-image'),
  
  // 인증
  authGetServer: () => ipcRenderer.invoke('auth-get-server'),
  authSetServer: (url) => ipcRenderer.invoke('auth-set-server', url),
  authRegister: (payload) => ipcRenderer.invoke('auth-register', payload),
  authLogin: (payload) => ipcRenderer.invoke('auth-login', payload),
  authLogout: () => ipcRenderer.invoke('auth-logout'),
  authGetUser: () => ipcRenderer.invoke('auth-get-user'),
  authCheck: () => ipcRenderer.invoke('auth-check'),
  authDeviceFingerprint: () => ipcRenderer.invoke('auth-device-fingerprint'),
  authTrial: () => ipcRenderer.invoke('auth-trial'),
  
  // 🆕 자동 업데이트 (electron-updater)
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_, data) => callback(data));
  },
  
  // 🆕 블러 자동 감지 (원본 자막 위치 찾기)
  detectSubtitleArea: (videoInput) => ipcRenderer.invoke('detect-subtitle-area', videoInput),
  onDetectSubtitleProgress: (callback) => {
    ipcRenderer.on('detect-subtitle-progress', (_, data) => callback(data));
  },
});
