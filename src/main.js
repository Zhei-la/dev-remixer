// src/main.js - Electron 메인 프로세스 (썰툰 모드 추가)
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { processVideo, VOICE_CATALOG } = require('./processor');
const { processSsultoon, generateScript, getRandomTopics, TTS_VOICES, generateImagePollinations, convertSpeechStyle } = require('./ssultoon-processor');
const AuthClient = require('./auth-client');
const { IS_TRIAL, IS_FULL, BUILD_MODE, LIMITS, APP_DISPLAY_NAME, getLimitsForUser, getAppDisplayName } = require('./build-mode');

// 🆕 자동 업데이트 (electron-updater)
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  // 로그 설정
  autoUpdater.logger = console;
  // 수동 다운로드 (사용자 확인 후)
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
} catch (e) {
  console.warn('[Updater] electron-updater 로드 실패 (개발 모드 또는 미설치):', e.message);
}

console.log(`[Build] Mode: ${BUILD_MODE} | Display: ${APP_DISPLAY_NAME}`);

// 🔴 전역 에러 핸들러 - CANCELLED_BY_USER 에러는 무시
process.on('uncaughtException', (error) => {
  if (error.message === 'CANCELLED_BY_USER') {
    console.log('[Main] 사용자가 작업을 취소했습니다.');
    return; // 크래시 방지
  }
  console.error('[Main] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message === 'CANCELLED_BY_USER') {
    console.log('[Main] 사용자가 작업을 취소했습니다. (Promise)');
    return;
  }
  console.error('[Main] Unhandled Rejection:', reason);
});

let mainWindow;
let authClient;

// 🔴 사용자 등급에 따른 동적 LIMITS
function getCurrentLimits() {
  if (IS_TRIAL) return LIMITS;
  const tier = authClient && authClient.user && authClient.user.tier;
  return getLimitsForUser(tier || 'trial');
}

function getCurrentAppName() {
  if (IS_TRIAL) return APP_DISPLAY_NAME;
  const tier = authClient && authClient.user && authClient.user.tier;
  return getAppDisplayName(tier || 'unknown');
}

function createWindow(htmlFile = 'login.html') {
  if (mainWindow) {
    mainWindow.close();
  }
  mainWindow = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: htmlFile === 'login.html' ? 520 : 1400,
    height: htmlFile === 'login.html' ? 720 : 900,
    minWidth: htmlFile === 'login.html' ? 480 : 1100,
    minHeight: htmlFile === 'login.html' ? 680 : 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#08080f',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, htmlFile));
  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle(APP_DISPLAY_NAME);
    mainWindow.show();
  });
  
  // 🆕 외부 링크는 기본 브라우저에서 열기 (target="_blank" 처리)
  // Electron 기본 동작: 빈 새 창 뜨는 버그 해결
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // http/https 링크는 외부 브라우저로
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const { shell } = require('electron');
      shell.openExternal(url);
      return { action: 'deny' };  // Electron에서 새 창 안 띄움
    }
    return { action: 'allow' };  // 그 외는 기본 동작
  });
  
  // 🆕 processor.js 에서 하트비트 전송용
  global.__mainWindow = mainWindow;
}

app.whenReady().then(async () => {
  const authConfigPath = path.join(app.getPath('userData'), 'auth.json');
  authClient = new AuthClient(authConfigPath);

  if (authClient.isLoggedIn()) {
    const check = await authClient.checkAuth();
    if (check.ok) {
      createWindow('renderer.html');
      // 🆕 로그인 사용자: 백그라운드에서 버전 체크
      checkForUpdate(check.data);
    } else {
      authClient.clearAuth();
      createWindow('login.html');
    }
  } else {
    createWindow('login.html');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(authClient.isLoggedIn() ? 'renderer.html' : 'login.html');
    }
  });
  
// 🆕 버전 비교 + 업데이트 알림
function checkForUpdate(serverData) {
  try {
    if (!serverData || !serverData.latestVersion) return;
    
    const currentVersion = app.getVersion(); // package.json의 version
    const latestVersion = serverData.latestVersion;
    const downloadUrl = serverData.downloadUrl || 'https://github.com/Zhei-la/shorts-remixer-download/releases/latest';
    
    console.log(`[update-check] 현재: ${currentVersion}, 최신: ${latestVersion}`);
    
    // 버전 비교 (semver 간단 비교)
    if (compareVersions(currentVersion, latestVersion) >= 0) {
      console.log('[update-check] 최신 버전 사용 중');
      return;
    }
    
    // 새 버전 있음 → 다이얼로그
    setTimeout(() => {
      dialog.showMessageBox({
        type: 'info',
        title: '🎉 새 버전 출시',
        message: `쇼츠 리믹서 v${latestVersion}이 출시되었습니다!`,
        detail: `현재 버전: v${currentVersion}\n최신 버전: v${latestVersion}\n\n새 기능과 개선사항이 포함되어 있습니다. 다운로드 페이지에서 받으시겠습니까?\n\n(다운로드 후 재설치하시면 됩니다)`,
        buttons: ['지금 다운로드', '나중에'],
        defaultId: 0,
        cancelId: 1,
      }).then(result => {
        if (result.response === 0) {
          shell.openExternal(downloadUrl);
        }
      });
    }, 3000); // 3초 후 (앱 로딩 끝난 후)
  } catch (e) {
    console.warn('[update-check] 실패:', e.message);
  }
}

// 버전 비교 헬퍼: a > b면 1, a == b면 0, a < b면 -1
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n) || 0);
  const pb = String(b).split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
  // 🆕 자동 업데이트 체크 (앱 시작 3초 후)
  // 개발 모드(app.isPackaged = false)에서는 실행 안 함
  if (autoUpdater && app.isPackaged) {
    setTimeout(() => {
      console.log('[Updater] 업데이트 체크 시작...');
      autoUpdater.checkForUpdates().catch(err => {
        console.warn('[Updater] 체크 실패:', err.message);
      });
    }, 3000);
  } else {
    console.log('[Updater] 개발 모드 또는 미설치 상태 - 업데이트 체크 스킵');
  }
});

// 🆕 ===== 자동 업데이트 이벤트 핸들러 =====
if (autoUpdater) {
  // 업데이트 체크 중
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] 업데이트 확인 중...');
    sendUpdateStatus('checking', '업데이트 확인 중...');
  });
  
  // 업데이트 있음
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] 업데이트 발견:', info.version);
    sendUpdateStatus('available', `새 버전 발견: v${info.version}`, {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate: info.releaseDate,
      currentVersion: app.getVersion(),
    });
  });
  
  // 업데이트 없음
  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] 최신 버전:', info.version);
    sendUpdateStatus('not-available', `최신 버전입니다 (v${info.version})`);
  });
  
  // 다운로드 진행률
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    const speed = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
    console.log(`[Updater] 다운로드 ${percent}% (${speed} MB/s)`);
    sendUpdateStatus('downloading', `다운로드 중... ${percent}%`, {
      percent,
      speed,
      transferred: progress.transferred,
      total: progress.total,
    });
  });
  
  // 다운로드 완료
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] 다운로드 완료, 재시작 시 설치됩니다.');
    sendUpdateStatus('downloaded', `업데이트 준비 완료! 재시작하면 적용됩니다.`, {
      version: info.version,
    });
  });
  
  // 에러
  autoUpdater.on('error', (err) => {
    console.error('[Updater] 에러:', err);
    sendUpdateStatus('error', `업데이트 오류: ${err.message}`);
  });
}

// 업데이트 상태를 renderer에 전달
function sendUpdateStatus(status, message, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, message, ...data });
  }
}

// 🆕 ===== 업데이트 IPC 핸들러 =====
// 수동으로 업데이트 체크
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) {
    return { success: false, error: '업데이트 모듈이 로드되지 않았습니다 (개발 모드).' };
  }
  if (!app.isPackaged) {
    return { success: false, error: '개발 모드에서는 업데이트를 체크할 수 없습니다.' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { 
      success: true, 
      updateInfo: result && result.updateInfo ? {
        version: result.updateInfo.version,
        currentVersion: app.getVersion(),
      } : null
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 업데이트 다운로드 시작 (사용자 동의 후)
ipcMain.handle('download-update', async () => {
  if (!autoUpdater) {
    return { success: false, error: '업데이트 모듈 없음' };
  }
  try {
    autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 업데이트 설치 + 재시작
ipcMain.handle('install-update', async () => {
  if (!autoUpdater) {
    return { success: false, error: '업데이트 모듈 없음' };
  }
  try {
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 현재 앱 버전 가져오기
ipcMain.handle('get-app-version', () => {
  return { version: app.getVersion() };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===== 작업 폴더 =====
function getWorkDir() {
  const workDir = path.join(app.getPath('videos'), 'ShortsRemixer');
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
  return workDir;
}

// ===== 다중 영상/파일 합치기 =====
const { spawn } = require('child_process');

async function mergeMultipleSources({ urls, uploadedFiles, workDir, jobId, onProgress, jobState }) {
  const tmpDir = path.join(workDir, `merge_${jobId}`);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const ytDlp = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  const sourceFiles = [];

  // 🆕 공통 헬퍼: spawn + 레지스트리 등록 + 취소 감지 + 타임아웃
  //   timeoutMs: 무응답(stderr 끊김) 기반 kill (기본 120초)
  //   hardMs   : 전체 최대 실행 시간 (기본 180초)
  function runSpawn(cmd, args, { timeoutMs = 120000, hardMs = 180000, onStderr } = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { windowsHide: true });
      let stderrOutput = '';
      let lastStderrAt = Date.now();
      let finished = false;

      // 자식 프로세스 등록 (취소 시 강제 종료되게)
      if (jobId && typeof global.registerChildProcess === 'function') {
        global.registerChildProcess(jobId, proc);
      }

      // 취소 감지 폴링 (1초마다)
      const cancelInt = setInterval(() => {
        if (finished) return;
        if (jobState && jobState.cancelled) {
          finished = true;
          clearInterval(cancelInt);
          clearInterval(stallInt);
          clearTimeout(hardTimer);
          try {
            if (process.platform === 'win32') {
              require('child_process').exec(`taskkill /F /T /PID ${proc.pid}`, () => {});
            } else {
              proc.kill('SIGKILL');
            }
          } catch(e) {}
          reject(new Error('CANCELLED_BY_USER'));
        }
      }, 1000);

      // 무응답 타임아웃
      const stallInt = setInterval(() => {
        if (finished) return;
        const stall = Date.now() - lastStderrAt;
        if (stall > timeoutMs) {
          finished = true;
          clearInterval(cancelInt);
          clearInterval(stallInt);
          clearTimeout(hardTimer);
          try {
            if (process.platform === 'win32') {
              require('child_process').exec(`taskkill /F /T /PID ${proc.pid}`, () => {});
            } else {
              proc.kill('SIGKILL');
            }
          } catch(e) {}
          reject(new Error(`TIMEOUT: ${Math.round(stall/1000)}초 응답 없음`));
        }
      }, 5000);

      // 하드 리미트
      const hardTimer = setTimeout(() => {
        if (finished) return;
        finished = true;
        clearInterval(cancelInt);
        clearInterval(stallInt);
        try {
          if (process.platform === 'win32') {
            require('child_process').exec(`taskkill /F /T /PID ${proc.pid}`, () => {});
          } else {
            proc.kill('SIGKILL');
          }
        } catch(e) {}
        reject(new Error(`HARD_TIMEOUT: ${Math.round(hardMs/1000)}초 초과`));
      }, hardMs);

      proc.stderr?.on('data', (data) => {
        stderrOutput += data.toString();
        lastStderrAt = Date.now();
        if (onStderr) try { onStderr(data); } catch(e) {}
      });

      proc.on('close', (code) => {
        if (finished) return;
        finished = true;
        clearInterval(cancelInt);
        clearInterval(stallInt);
        clearTimeout(hardTimer);
        resolve({ code, stderr: stderrOutput });
      });
      proc.on('error', (err) => {
        if (finished) return;
        finished = true;
        clearInterval(cancelInt);
        clearInterval(stallInt);
        clearTimeout(hardTimer);
        reject(err);
      });
    });
  }

  // 취소 체크 헬퍼
  const checkCancel = () => {
    if (jobState && jobState.cancelled) throw new Error('CANCELLED_BY_USER');
  };

  // 1. URL들 다운로드
  for (let i = 0; i < urls.length; i++) {
    checkCancel();
    onProgress('download', 8 + (i * 10), `영상 ${i + 1}/${urls.length} 다운로드 중...`);
    const outPath = path.join(tmpDir, `url_${i}.mp4`);
    const { code } = await runSpawn(ytDlp, [
      '-f', 'best[ext=mp4]/best',
      '-o', outPath,
      '--no-playlist',
      urls[i],
    ], { timeoutMs: 180000, hardMs: 300000 });

    if (code === 0 && fs.existsSync(outPath)) {
      sourceFiles.push({ path: outPath, type: 'video' });
    } else {
      throw new Error(`URL ${i + 1} 다운로드 실패`);
    }
  }

  // 2. 업로드 파일 처리
  const totalFiles = uploadedFiles.length;
  for (let i = 0; i < uploadedFiles.length; i++) {
    checkCancel();
    const f = uploadedFiles[i];
    if (!fs.existsSync(f.path)) {
      console.warn(`[process-video] 파일 없음 스킵: ${f.path}`);
      continue;
    }

    // 🆕 매 파일마다 정확한 진행률 (30% ~ 48%)
    const pct = 30 + Math.round((i / Math.max(1, totalFiles)) * 18);

    if (f.type === 'video') {
      onProgress('download', pct, `영상 ${i + 1}/${totalFiles} 표준화 중...`);
      const normalizedPath = path.join(tmpDir, `video_${i}.mp4`);

      console.log(`[process-video] 영상 표준화 시작: ${f.path}`);

      try {
        const { code, stderr } = await runSpawn(ffmpeg, [
          '-y',
          '-i', f.path,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',                 // 🆕 23 → 26 (용량/속도 개선)
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30',
          '-pix_fmt', 'yuv420p',
          '-r', '30',
          '-g', '60',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-ac', '2',
          '-fflags', '+genpts',
          '-movflags', '+faststart',
          normalizedPath,
        ], { timeoutMs: 90000, hardMs: 180000 });

        if (code === 0 && fs.existsSync(normalizedPath)) {
          const size = fs.statSync(normalizedPath).size;
          console.log(`[process-video] ✅ 영상 ${i + 1} 표준화 완료 (${(size/1024/1024).toFixed(2)}MB)`);
          sourceFiles.push({ path: normalizedPath, type: 'video' });
        } else {
          console.error(`[process-video] ❌ 영상 ${i + 1} 표준화 실패 (code: ${code})`);
          console.error(`[process-video] stderr: ${stderr.slice(-800)}`);
          throw new Error(`영상 ${i + 1} 표준화 실패 (code: ${code})`);
        }
      } catch (vidErr) {
        // 취소/타임아웃은 상위로 전파
        if (vidErr.message === 'CANCELLED_BY_USER' || vidErr.message.startsWith('TIMEOUT') || vidErr.message.startsWith('HARD_TIMEOUT')) {
          throw vidErr;
        }
        console.warn(`[process-video] 영상 표준화 실패, 원본 사용: ${vidErr.message}`);
        sourceFiles.push({ path: f.path, type: 'video' });
      }
    } else if (f.type === 'image') {
      onProgress('download', pct, `이미지 ${i + 1}/${totalFiles} 변환 중...`);
      const imgVideoPath = path.join(tmpDir, `img_${i}.mp4`);

      console.log(`[process-video] 이미지 변환 시작: ${f.path}`);

      const { code, stderr } = await runSpawn(ffmpeg, [
        '-y',
        '-framerate', '30',
        '-loop', '1',
        '-t', '3',
        '-i', f.path,
        '-f', 'lavfi',
        '-t', '3',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '26',
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-g', '60',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-fflags', '+genpts',
        '-movflags', '+faststart',
        imgVideoPath,
      ], { timeoutMs: 60000, hardMs: 120000 });

      if (code === 0 && fs.existsSync(imgVideoPath)) {
        const size = fs.statSync(imgVideoPath).size;
        console.log(`[process-video] ✅ 이미지 ${i + 1} 변환 완료 (${(size/1024/1024).toFixed(2)}MB)`);
        sourceFiles.push({ path: imgVideoPath, type: 'video' });
      } else {
        console.error(`[process-video] ❌ 이미지 ${i + 1} 변환 실패 (code: ${code})`);
        console.error(`[process-video] stderr 마지막 1000자:\n${stderr.slice(-1000)}`);

        let errorDetail = `code: ${code}`;
        if (stderr.includes('No such file')) errorDetail = '파일을 찾을 수 없습니다';
        else if (stderr.includes('Invalid data')) errorDetail = '이미지 파일이 손상되었습니다';
        else if (stderr.includes('Permission denied')) errorDetail = '파일 접근 권한 없음';
        else if (stderr.length > 0) {
          const lines = stderr.split('\n').filter(l => l.trim() && !l.startsWith('frame=') && !l.startsWith('size='));
          if (lines.length > 0) errorDetail = lines[lines.length - 1].substring(0, 200);
        }
        throw new Error(`이미지 ${i + 1} 변환 실패 (${f.name || path.basename(f.path)}): ${errorDetail}`);
      }
    }
  }

  checkCancel();

  if (sourceFiles.length === 0) {
    throw new Error('처리할 영상/이미지가 없습니다');
  }

  if (sourceFiles.length === 1) {
    return sourceFiles[0].path;
  }

  // 3. 합치기
  onProgress('download', 50, `영상 합치는 중... (${sourceFiles.length}개)`);
  const concatFilePath = path.join(tmpDir, 'concat.txt');
  const concatContent = sourceFiles.map(f => `file '${f.path.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatFilePath, concatContent);

  const mergedPath = path.join(tmpDir, 'merged.mp4');
  const { code: mergeCode, stderr: mergeErr } = await runSpawn(ffmpeg, [
    '-y',
    '-f', 'concat', '-safe', '0',
    '-i', concatFilePath,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '26',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-fflags', '+genpts',
    '-vsync', 'cfr',
    '-movflags', '+faststart',
    mergedPath,
  ], { timeoutMs: 120000, hardMs: 300000 });

  if (mergeCode === 0 && fs.existsSync(mergedPath)) {
    const size = fs.statSync(mergedPath).size;
    console.log(`[process-video] ✅ 영상 합치기 완료 (${(size/1024/1024).toFixed(2)}MB)`);
  } else {
    console.error(`[process-video] ❌ 영상 합치기 실패 (code: ${mergeCode})`);
    console.error(`[process-video] stderr: ${mergeErr.slice(-800)}`);
    throw new Error(`영상 합치기 실패 (code: ${mergeCode})`);
  }

  return mergedPath;
}

// ===== 설정 =====
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// ===== 체험판 카운터 =====
function getTrialPath() {
  return path.join(app.getPath('userData'), 'trial.json');
}

function getTrialCount() {
  try {
    const data = JSON.parse(fs.readFileSync(getTrialPath(), 'utf-8'));
    return data.count || 0;
  } catch {
    return 0;
  }
}

function incrementTrialCount() {
  const current = getTrialCount();
  const newCount = current + 1;
  fs.writeFileSync(getTrialPath(), JSON.stringify({ count: newCount }));
  return newCount;
}

// ===== IPC 핸들러 =====
ipcMain.handle('load-config', () => loadConfig());
ipcMain.handle('save-config', (e, config) => {
  saveConfig(config);
  return true;
});

ipcMain.handle('open-work-folder', () => {
  shell.openPath(getWorkDir());
});

ipcMain.handle('open-file', (e, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.openPath(filePath);
  }
});

// 🆕 외부 URL 열기 (쿠팡 제품 보러가기 등)
ipcMain.handle('open-external-url', (e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('copy-to-clipboard', (e, text) => {
  clipboard.writeText(text);
  return true;
});

// 내장 BGM 파일 경로 반환
ipcMain.handle('get-builtin-bgm-path', (e, filename) => {
  // 개발 모드: 앱 루트의 bgm 폴더
  // 프로덕션: resources/bgm 폴더
  const isDev = !app.isPackaged;
  const bgmDir = isDev 
    ? path.join(__dirname, 'bgm')
    : path.join(process.resourcesPath, 'bgm');
  
  const bgmPath = path.join(bgmDir, filename);
  if (fs.existsSync(bgmPath)) {
    return bgmPath;
  }
  console.warn(`[BGM] 파일 없음: ${bgmPath}`);
  return null;
});

ipcMain.handle('get-video-duration', async (e, filePath) => {
  const ffprobe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  return new Promise((resolve) => {
    const proc = spawn(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', () => resolve(parseFloat(out) || 0));
    proc.on('error', () => resolve(0));
  });
});

// 🆕 URL → 영상 길이 (yt-dlp로 메타데이터만 추출, 다운로드 X)
ipcMain.handle('get-url-video-duration', async (e, url) => {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string') return resolve({ success: false, duration: 0, error: 'URL 없음' });
    const ytdlp = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    // --print duration: 영상 길이만 stdout으로
    // --no-download: 메타데이터만 (빠름)
    // --no-warnings: 경고 무시
    const proc = spawn(ytdlp, [
      '--print', 'duration',
      '--no-download',
      '--no-warnings',
      '--socket-timeout', '20',
      url
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    const timeout = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve({ success: false, duration: 0, error: 'timeout' });
    }, 25000);
    proc.on('close', () => {
      clearTimeout(timeout);
      // 첫 줄(첫 영상)의 길이만 사용
      const firstLine = out.trim().split(/\r?\n/)[0] || '';
      const dur = parseFloat(firstLine);
      if (isFinite(dur) && dur > 0) {
        console.log(`[get-url-video-duration] ${url} → ${dur}초`);
        resolve({ success: true, duration: dur });
      } else {
        console.warn('[get-url-video-duration] 파싱 실패:', out, err);
        resolve({ success: false, duration: 0, error: 'parse failed' });
      }
    });
    proc.on('error', (e) => {
      clearTimeout(timeout);
      resolve({ success: false, duration: 0, error: e.message });
    });
  });
});

// 🆕 ===== 블러 자동 감지 =====
// 영상 프레임 분석해서 원본 자막 위치 자동 찾기
ipcMain.handle('detect-subtitle-area', async (event, videoInput) => {
  try {
    const ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffprobe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    
    // videoInput: URL 또는 로컬 파일 경로
    const workDir = getWorkDir();
    const jobDir = path.join(workDir, `detect_${Date.now()}`);
    fs.mkdirSync(jobDir, { recursive: true });
    
    const sendProgress = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('detect-subtitle-progress', { message: msg });
      }
    };
    
    let videoPath = videoInput;
    
    // URL이면 다운로드
    if (videoInput.startsWith('http://') || videoInput.startsWith('https://')) {
      sendProgress('📥 영상 일부 다운로드 중...');
      const ytdlp = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      videoPath = path.join(jobDir, 'video.mp4');
      
      try {
        await new Promise((resolve, reject) => {
          const proc = spawn(ytdlp, [
            videoInput.trim(),
            '-o', videoPath,
            '-f', 'best[ext=mp4]/best',
            '--no-playlist', '--quiet',
            '--download-sections', '*0-20',  // 앞 20초만
          ]);
          proc.on('close', code => code === 0 && fs.existsSync(videoPath) ? resolve() : reject(new Error('다운로드 실패')));
          proc.on('error', reject);
          // 타임아웃 30초
          setTimeout(() => { try { proc.kill(); } catch(e){} reject(new Error('다운로드 타임아웃')); }, 30000);
        });
      } catch (e) {
        fs.rmSync(jobDir, { recursive: true, force: true });
        return { success: false, error: '영상 샘플 다운로드 실패: ' + e.message };
      }
    }
    
    if (!fs.existsSync(videoPath)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
      return { success: false, error: '영상 파일을 찾을 수 없음' };
    }
    
    sendProgress('🔍 프레임 분석 중...');
    
    // 1. 영상 길이 확인
    const duration = await new Promise((resolve) => {
      const proc = spawn(ffprobe, [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
      ]);
      let out = '';
      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.on('close', () => resolve(parseFloat(out) || 10));
      proc.on('error', () => resolve(10));
    });
    
    // 2. 여러 시점에서 프레임 추출 (총 8장)
    const frameCount = 8;
    const framesDir = path.join(jobDir, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });
    
    // 영상 길이에 따라 적절한 간격으로 추출
    const sampleDuration = Math.min(duration, 15);
    const interval = sampleDuration / frameCount;
    
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-i', videoPath,
        '-t', sampleDuration.toString(),
        '-vf', `fps=1/${interval.toFixed(2)},scale=360:640`,  // 360x640으로 축소 (분석 속도 ↑)
        '-q:v', '5',
        path.join(framesDir, 'f_%02d.png'),
        '-y'
      ]);
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('프레임 추출 실패')));
      proc.on('error', reject);
      setTimeout(() => { try { proc.kill(); } catch(e){} reject(new Error('프레임 추출 타임아웃')); }, 20000);
    }).catch(err => {
      console.warn('[detect] 프레임 추출 실패:', err.message);
    });
    
    // 3. 프레임 파일 목록
    const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
    if (frameFiles.length === 0) {
      fs.rmSync(jobDir, { recursive: true, force: true });
      return { success: false, error: '프레임 추출에 실패했습니다.' };
    }
    
    sendProgress(`🧮 ${frameFiles.length}개 프레임 분석 중...`);
    
    // 4. 각 프레임을 raw RGB로 추출해서 가로줄 단위 분석
    // Sharp 없이 ffmpeg으로 raw 픽셀 데이터 얻기
    const FRAME_W = 360;
    const FRAME_H = 640;
    
    // 각 프레임의 "자막 후보 Y 좌표" 찾기
    const allCandidates = [];
    
    for (const frameFile of frameFiles) {
      const framePath = path.join(framesDir, frameFile);
      const rawPath = framePath.replace('.png', '.raw');
      
      // PNG → raw grayscale 변환 (ffmpeg)
      try {
        await new Promise((resolve, reject) => {
          const proc = spawn(ffmpegPath, [
            '-i', framePath,
            '-f', 'rawvideo',
            '-pix_fmt', 'gray',
            '-s', `${FRAME_W}x${FRAME_H}`,
            rawPath,
            '-y'
          ]);
          proc.on('close', code => code === 0 ? resolve() : reject(new Error('raw 변환 실패')));
          proc.on('error', reject);
        });
      } catch (e) {
        console.warn(`[detect] ${frameFile} raw 변환 실패:`, e.message);
        continue;
      }
      
      if (!fs.existsSync(rawPath)) continue;
      
      // raw 픽셀 데이터 읽기 (grayscale: 1 byte per pixel)
      const rawData = fs.readFileSync(rawPath);
      
      // 가로줄별 분석
      // 자막 특징: 
      // 1) 가로로 밝기 대비가 큼 (텍스트 vs 배경)
      // 2) 주변 위아래와 명확히 구분됨
      const rowStats = [];
      for (let y = 0; y < FRAME_H; y++) {
        let sum = 0, sumSq = 0;
        let minVal = 255, maxVal = 0;
        for (let x = 0; x < FRAME_W; x++) {
          const val = rawData[y * FRAME_W + x];
          sum += val;
          sumSq += val * val;
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        }
        const mean = sum / FRAME_W;
        const variance = sumSq / FRAME_W - mean * mean;
        const stdDev = Math.sqrt(Math.max(0, variance));
        const range = maxVal - minVal;
        
        rowStats.push({ y, mean, stdDev, range });
      }
      
      // 자막 후보 찾기: stdDev(분산)가 큰 연속 구간 = 텍스트 영역
      // 중앙~하단 위주로 (자막은 주로 거기 있음)
      const startY = Math.floor(FRAME_H * 0.3);  // 상단 30%는 제외
      
      // 각 row의 "자막 점수" 계산
      // 높은 대비(stdDev) + 큰 범위(range) = 자막 가능성
      const scores = rowStats.map(r => ({
        y: r.y,
        score: r.y < startY ? 0 : (r.stdDev * 0.6 + r.range * 0.4),
      }));
      
      // 국소적 peak 찾기 (20픽셀 윈도우)
      const peaks = [];
      for (let i = 10; i < scores.length - 10; i++) {
        const centerScore = scores[i].score;
        if (centerScore < 30) continue;  // 너무 낮은 점수는 무시
        
        // 주변 20픽셀과 비교
        let isPeak = true;
        let maxAround = 0;
        for (let j = -10; j <= 10; j++) {
          if (j === 0) continue;
          if (scores[i + j].score > maxAround) maxAround = scores[i + j].score;
        }
        if (centerScore < maxAround * 1.2) isPeak = false;
        
        if (isPeak) peaks.push({ y: i, score: centerScore });
      }
      
      // 상위 3개 피크만
      peaks.sort((a, b) => b.score - a.score);
      const topPeaks = peaks.slice(0, 3);
      allCandidates.push(...topPeaks);
      
      // 임시 raw 파일 삭제
      try { fs.unlinkSync(rawPath); } catch(e) {}
    }
    
    if (allCandidates.length === 0) {
      fs.rmSync(jobDir, { recursive: true, force: true });
      return { 
        success: false, 
        error: '자막으로 추정되는 영역을 찾지 못했습니다. 수동 설정을 이용해주세요.' 
      };
    }
    
    sendProgress('🎯 자막 위치 계산 중...');
    
    // 5. 전체 프레임에서 공통으로 나타난 Y 좌표 찾기
    // 비슷한 Y끼리 클러스터링 (±15px 범위)
    const clusters = [];
    for (const cand of allCandidates) {
      let found = false;
      for (const cluster of clusters) {
        if (Math.abs(cluster.centerY - cand.y) <= 15) {
          cluster.points.push(cand);
          cluster.totalScore += cand.score;
          cluster.centerY = cluster.points.reduce((s, p) => s + p.y, 0) / cluster.points.length;
          found = true;
          break;
        }
      }
      if (!found) {
        clusters.push({
          centerY: cand.y,
          points: [cand],
          totalScore: cand.score,
        });
      }
    }
    
    // 여러 프레임에서 공통으로 나타난 클러스터가 진짜 자막일 확률 높음
    // (= 같은 위치에 지속적으로 텍스트가 있음)
    clusters.sort((a, b) => {
      // 점수 계산: 등장 빈도(프레임 개수) × 평균 점수
      const aScore = a.points.length * (a.totalScore / a.points.length);
      const bScore = b.points.length * (b.totalScore / b.points.length);
      return bScore - aScore;
    });
    
    const bestCluster = clusters[0];
    
    // 360x640으로 축소한 좌표를 % 비율로 변환
    // UI의 blurPosSlider는 0~95 (위에서부터 %? 아래부터 %?)
    // 기존 코드를 보면 `pos` 는 bottom 기준 % (CSS bottom) 
    // → pos 95% = 거의 맨 위, pos 5% = 맨 아래
    // ffmpeg Y = H * (1 - pos/100) - blurH
    // 역산: pos = 100 * (1 - (Y + blurH/2) / H)
    
    const detectedY = bestCluster.centerY;
    const detectedYPercentFromTop = (detectedY / FRAME_H) * 100;
    
    // pos는 bottom 기준이므로 100에서 뺌, 자막 "바닥"이 아래로 가려면 약간 아래로 조정
    // 감지한 Y의 아래쪽 경계(자막 하단)에 맞추는 게 자연스러움
    // 자막 높이를 대략 6~10% 로 가정
    const autoBlurHeight = Math.round(FRAME_H * 0.08);  // 약 8%
    const blurCenterY = detectedY;  // 감지된 Y = 자막 중심
    const blurTopY = blurCenterY - autoBlurHeight / 2;
    const blurBottomY = blurCenterY + autoBlurHeight / 2;
    
    // pos = 100 * (1 - blurBottomY / H)  (CSS bottom 기준)
    const posPercent = Math.max(0, Math.min(95, 100 * (1 - blurBottomY / FRAME_H)));
    
    // 실제 픽셀로 환산 (1080x1920 기준)
    const realH = 1920;
    const heightPx = Math.round(autoBlurHeight * (realH / FRAME_H));  // 약 154px
    
    console.log(`[detect] 결과: centerY=${Math.round(detectedY)}/${FRAME_H} (${detectedYPercentFromTop.toFixed(1)}% from top)`);
    console.log(`[detect] → pos=${posPercent.toFixed(1)}% (bottom 기준), height=${heightPx}px, confidence=${bestCluster.points.length}/${frameFiles.length} frames`);
    
    // 임시 폴더 정리
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch(e) {}
    
    return {
      success: true,
      detection: {
        pos: Math.round(posPercent),              // 0~95, 블러 UI pos 슬라이더 값
        height: Math.max(60, Math.min(500, heightPx)),  // 60~500 px
        strength: 8,                               // 기본값
        confidence: bestCluster.points.length / frameFiles.length,  // 0~1, 여러 프레임에서 공통 감지된 비율
        framesAnalyzed: frameFiles.length,
        debugInfo: {
          detectedYpercent: detectedYPercentFromTop.toFixed(1),
          clustersFound: clusters.length,
        }
      }
    };
    
  } catch (error) {
    console.error('[detect] 자막 영역 감지 오류:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-voice-catalog', () => VOICE_CATALOG);
ipcMain.handle('get-build-info', () => ({
  mode: BUILD_MODE,
  isTrial: IS_TRIAL,
  isFull: IS_FULL,
  limits: getCurrentLimits(),
  appName: getCurrentAppName(),
}));

ipcMain.handle('get-trial-count', () => getTrialCount());
ipcMain.handle('get-user-tier', () => {
  return {
    tier: authClient?.user?.tier || 'unknown',
    limits: getCurrentLimits(),
    user: authClient?.user ? {
      username: authClient.user.username,
      id: authClient.user.id,
      email: authClient.user.email,
    } : null,
  };
});

// ===== 파일 선택 다이얼로그 =====
ipcMain.handle('select-files', async (e, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options?.title || '파일 선택',
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters || [
      { name: '영상/이미지', extensions: ['mp4', 'mov', 'avi', 'mkv', 'jpg', 'jpeg', 'png', 'webp'] },
    ],
  });
  
  if (result.canceled) return [];
  
  return result.filePaths.map(fp => ({
    path: fp,
    name: path.basename(fp),
    type: /\.(mp4|mov|avi|mkv|webm)$/i.test(fp) ? 'video' : 'image',
  }));
});

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '이미지 선택',
    properties: ['openFile'],
    filters: [
      { name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] },
    ],
  });
  
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ===== 인증 IPC =====
ipcMain.handle('auth-get-server', () => authClient.serverUrl);
ipcMain.handle('auth-set-server', (e, url) => {
  authClient.setServerUrl(url);
  return true;
});

ipcMain.handle('auth-register', async (e, { username, email, password, inviteCode }) => {
  return authClient.register(username, email, password, inviteCode);
});

ipcMain.handle('auth-login', async (e, { username, password }) => {
  const result = await authClient.login(username, password);
  if (result.ok && result.data.success) {
    // 체험판 만료 체크
    const user = result.data.user;
    if (user && (user.tier === 'trial' || !user.tier)) {
      const usageCount = user.usage_count || 0;
      const usageLimit = user.usage_limit || 10;
      if (usageCount >= usageLimit) {
        // 체험판 만료 - 로그인 차단
        authClient.logout();
        return {
          ok: false,
          error: 'TRIAL_EXPIRED',
          data: {
            success: false,
            error: 'TRIAL_EXPIRED',
            message: `체험판이 만료되었습니다. (${usageCount}/${usageLimit}회 사용)\n\n정식판 구매는 카카오톡으로 문의해주세요.`,
            usageCount,
            usageLimit
          }
        };
      }
    }
    setTimeout(() => createWindow('renderer.html'), 300);
  }
  return result;
});

ipcMain.handle('auth-logout', () => {
  authClient.logout();
  setTimeout(() => createWindow('login.html'), 100);
  return true;
});

ipcMain.handle('auth-get-user', () => authClient.getUser());

// 🆕 서버에서 사용자 정보 다시 받아오기 (등급 변경 후 반영용)
ipcMain.handle('auth-refresh-user', async () => {
  try {
    // authClient에 verify 또는 sync 메서드 있으면 호출
    if (typeof authClient.verifyToken === 'function') {
      await authClient.verifyToken();
    } else if (typeof authClient.refreshUser === 'function') {
      await authClient.refreshUser();
    } else if (typeof authClient.fetchUser === 'function') {
      await authClient.fetchUser();
    }
    return { success: true, user: authClient.getUser() };
  } catch (e) {
    console.warn('[auth-refresh-user] 실패:', e.message);
    return { success: false, error: e.message };
  }
});
ipcMain.handle('auth-check', async () => authClient.checkAuth());
ipcMain.handle('auth-device-fingerprint', () => authClient.deviceFingerprint);
ipcMain.handle('auth-trial', async () => authClient.createTrial());

// ===== 작업 관리 =====
const activeJobs = new Map();

// 🆕 현재 실행 중인 자식 프로세스들 추적 (ffmpeg, yt-dlp 등)
// jobId → Set<ChildProcess>
const jobChildProcesses = new Map();

// 🆕 프로세스 등록 함수 (processor.js 등에서 자식 프로세스 생성 시 호출 가능하도록 export)
function registerChildProcess(jobId, childProc) {
  if (!jobId || !childProc) return;
  if (!jobChildProcesses.has(jobId)) {
    jobChildProcesses.set(jobId, new Set());
  }
  jobChildProcesses.get(jobId).add(childProc);
  // 프로세스 종료 시 자동 제거
  childProc.on('exit', () => {
    const procs = jobChildProcesses.get(jobId);
    if (procs) {
      procs.delete(childProc);
      if (procs.size === 0) jobChildProcesses.delete(jobId);
    }
  });
}

// 🆕 특정 Job의 모든 자식 프로세스 강제 종료
function killJobProcesses(jobId) {
  const procs = jobChildProcesses.get(jobId);
  if (!procs || procs.size === 0) return 0;
  
  let killed = 0;
  for (const proc of procs) {
    try {
      if (proc && !proc.killed && proc.pid) {
        console.log(`[cancel] 프로세스 강제 종료: PID ${proc.pid}`);
        // Windows: taskkill로 자식 트리까지 강제 종료
        if (process.platform === 'win32') {
          const { exec } = require('child_process');
          exec(`taskkill /F /T /PID ${proc.pid}`, (err) => {
            if (err) console.warn(`[cancel] taskkill 실패 (PID ${proc.pid}):`, err.message);
          });
        } else {
          // macOS/Linux: SIGKILL
          proc.kill('SIGKILL');
        }
        killed++;
      }
    } catch (e) {
      console.warn(`[cancel] 프로세스 kill 실패:`, e.message);
    }
  }
  jobChildProcesses.delete(jobId);
  return killed;
}

ipcMain.handle('cancel-video', (event, jobId) => {
  console.log(`[cancel] 취소 요청: jobId=${jobId || 'ALL'}`);

  // 🆕 activeJobs + jobChildProcesses 모두 기준으로 전체 취소
  //    (jobId 매칭 안 돼도 실행 중인 모든 자식 프로세스 강제 종료)
  let totalKilled = 0;

  // 1) activeJobs에 등록된 모든 job에 cancelled 플래그
  for (const [id, job] of activeJobs.entries()) {
    job.cancelled = true;
    totalKilled += killJobProcesses(id);
  }

  // 2) 등록 안 된 고아 프로세스도 일괄 종료
  for (const [id, procs] of jobChildProcesses.entries()) {
    if (procs && procs.size > 0) {
      totalKilled += killJobProcesses(id);
    }
  }

  console.log(`[cancel] 전체 취소 완료: activeJobs=${activeJobs.size}개, 종료된 프로세스=${totalKilled}개`);
  return true;
});

// 🆕 다른 모듈(processor.js 등)에서 사용 가능하도록 export
global.registerChildProcess = registerChildProcess;
global.killJobProcesses = killJobProcesses;

// ===== 영상 처리 (기존) =====
ipcMain.handle('process-video', async (event, payload) => {
  // 🆕 호환성 처리: { url, config } 또는 { filePath, uploadedFiles, config }
  const { url, config, filePath, uploadedFiles: directUploadedFiles } = payload;
  
  // 🆕 직접 전달된 uploadedFiles가 있으면 config에 병합
  if (directUploadedFiles && Array.isArray(directUploadedFiles) && directUploadedFiles.length > 0) {
    config.uploadedFiles = directUploadedFiles;
    console.log(`[process-video] 업로드 파일 ${directUploadedFiles.length}개 받음`);
    directUploadedFiles.forEach((f, i) => {
      console.log(`  [${i + 1}] ${f.type === 'video' ? '🎬' : '🖼️'} ${f.name || f.path}`);
    });
  }
  
  const currentLimits = getCurrentLimits();
  const user = authClient.getUser();
  const isAdmin = user && user.role === 'admin';

  if (IS_TRIAL && !isAdmin) {
    const trialUsed = getTrialCount();
    const trialLimit = currentLimits.totalVideoLimit || 5;
    if (trialUsed >= trialLimit) {
      return {
        success: false,
        error: `🔒 체험판 사용 횟수를 모두 사용했습니다 (${trialUsed}/${trialLimit}회).\n\n정식판으로 업그레이드하면 매일 새롭게 사용할 수 있어요!`,
      };
    }

    if (currentLimits.lockedFeatures.drama && config.videoType === 'story') {
      return { success: false, error: '🔒 드라마 각본 모드는 정식판 전용입니다.' };
    }
    if (currentLimits.lockedFeatures.reaction && config.videoType === 'reaction') {
      return { success: false, error: '🔒 예능 썰 모드는 정식판 전용입니다.' };
    }
    if (currentLimits.lockedFeatures.longform && config.format === 'longform') {
      return { success: false, error: '🔒 롱폼 모드는 정식판 전용입니다.' };
    }
  }

  // 관리자는 서버 인증 스킵
  if (authClient.serverUrl && !isAdmin) {
    const verify = await authClient.verifyJob('video');
    if (!verify.ok) {
      // 체험판 만료 체크
      if (verify.error && verify.error.includes('Trial limit')) {
        return { 
          success: false, 
          error: `🎉 체험판 사용이 완료되었습니다!\n\n무료 체험 10회를 모두 사용하셨어요.\n쇼츠리믹서가 마음에 드셨다면 정식판으로 업그레이드해보세요!\n\n✨ 정식판 혜택:\n• 무제한 영상 생성\n• 예능썰/드라마 모드\n• 우선 지원\n\n📱 정식판 문의: https://open.kakao.com/me/Zheila\n(카카오톡 오픈채팅)`
        };
      }
      return { success: false, error: `인증 실패: ${verify.error}` };
    }
  }

  const workDir = getWorkDir();
  const jobId = Date.now().toString();
  const jobState = { cancelled: false };
  activeJobs.set(jobId, jobState);

  const sendProgress = (stage, percent, message) => {
    if (jobState.cancelled) throw new Error('CANCELLED_BY_USER');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('progress-update', { jobId, stage, percent, message });
    }
  };

  try {
    let finalUrl = url;
    const urls = (url || '').split('\n').map(s => s.trim()).filter(Boolean);
    const uploadedFiles = (config.uploadedFiles || []).filter(f => f.path);
    const needsMerging = urls.length > 1 || uploadedFiles.length > 0;

    if (needsMerging) {
      sendProgress('download', 5, '여러 영상 다운로드 + 합치기 준비 중...');
      const mergedPath = await mergeMultipleSources({
        urls, uploadedFiles, workDir, jobId, onProgress: sendProgress, jobState,
      });
      config.__preMergedVideoPath = mergedPath;
      finalUrl = 'merged://' + mergedPath;
    }

    // 오디오 없을 때 사용자에게 확인하는 콜백
    config.__askNoAudio = async () => {
      const { dialog } = require('electron');
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['AI 더빙으로 생성', '취소'],
        defaultId: 0,
        cancelId: 1,
        title: '오디오 없음',
        message: '이 영상에는 오디오가 없습니다.',
        detail: 'AI가 대본을 생성하고 더빙을 입힐까요?\n\n• AI 더빙으로 생성: 영상 내용을 분석해서 대본 생성 후 TTS 더빙\n• 취소: 작업 중단',
      });
      return result.response === 0 ? 'generate' : 'cancel';
    };

    // 🆕 제품 대본 편집 콜백 - renderer에 대본 보내고 확정 대기 (제품 모드만)
    if (config.videoType === 'product') {
      config.__waitForScriptConfirm = async (generatedScript, videoTranscript) => {
        return new Promise((resolve) => {
          // renderer에 대본 편집 요청 보내기
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('show-script-editor', { 
              jobId, 
              generatedScript, 
              videoTranscript 
            });
          }
          
          // 확정 이벤트 대기 (일회성 리스너)
          const listener = (event, data) => {
            if (data && data.jobId === jobId) {
              ipcMain.removeListener('script-confirmed', listener);
              resolve(data.confirmedScript);
            }
          };
          ipcMain.on('script-confirmed', listener);
        });
      };
    }

    // 🔴 디버그: processVideo 호출 전
    const result = await processVideo({
      url: finalUrl, config, workDir, jobId, onProgress: sendProgress,
    });
    
    activeJobs.delete(jobId);
    
    if (IS_TRIAL) {
      const used = incrementTrialCount();
      result.trialUsed = used;
      result.trialRemaining = Math.max(0, (LIMITS.totalVideoLimit || 5) - used);
    }
    
    return { success: true, result, jobId };
  } catch (error) {
    activeJobs.delete(jobId);
    
    if (authClient.serverUrl && authClient.isLoggedIn()) {
      try {
        await authClient.refundJob('video', error.message === 'CANCELLED_BY_USER' ? 'cancelled' : 'failed');
      } catch (e) {}
    }
    
    if (error.message === 'CANCELLED_BY_USER') {
      return { success: false, cancelled: true, error: '사용자가 취소함' };
    }
    
    return { success: false, error: error.message };
  }
});

// ===== 🆕 썰툰 처리 =====
ipcMain.handle('process-ssultoon', async (event, payload) => {
  const currentLimits = getCurrentLimits();
  const user = authClient.getUser();
  const isAdmin = user && user.role === 'admin';

  // 체험판 제한 체크 (관리자 제외)
  if (IS_TRIAL && !isAdmin) {
    const trialUsed = getTrialCount();
    const trialLimit = currentLimits.totalVideoLimit || 5;
    if (trialUsed >= trialLimit) {
      return {
        success: false,
        error: `🔒 체험판 사용 횟수를 모두 사용했습니다 (${trialUsed}/${trialLimit}회).`,
      };
    }
  }

  // 서버 검증 (관리자 제외)
  if (authClient.serverUrl && !isAdmin) {
    const verify = await authClient.verifyJob('ssultoon');
    if (!verify.ok) {
      // 체험판 만료 체크
      if (verify.error && verify.error.includes('Trial limit')) {
        return { 
          success: false, 
          error: `🎉 체험판 사용이 완료되었습니다!\n\n무료 체험 10회를 모두 사용하셨어요.\n쇼츠리믹서가 마음에 드셨다면 정식판으로 업그레이드해보세요!\n\n✨ 정식판 혜택:\n• 무제한 영상 생성\n• 예능썰/드라마 모드\n• 우선 지원\n\n📱 정식판 문의: https://open.kakao.com/me/Zheila\n(카카오톡 오픈채팅)`
        };
      }
      return { success: false, error: `인증 실패: ${verify.error}` };
    }
  }

  const workDir = getWorkDir();
  const jobId = Date.now().toString();
  const jobState = { cancelled: false };
  activeJobs.set(jobId, jobState);

  const sendProgress = (stage, percent, message) => {
    if (jobState.cancelled) throw new Error('CANCELLED_BY_USER');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('progress-update', { jobId, stage, percent, message });
    }
  };

  try {
    // 설정에서 API 키 가져오기
    const savedConfig = loadConfig();
    
    const result = await processSsultoon({
      ...payload,
      workDir,
      outputDir: workDir,
      groqApiKey: savedConfig.groqApiKey || payload.groqApiKey,
      openaiApiKey: savedConfig.openaiApiKey || payload.openaiApiKey,
    }, sendProgress);

    activeJobs.delete(jobId);

    if (IS_TRIAL) {
      const used = incrementTrialCount();
      result.trialUsed = used;
      result.trialRemaining = Math.max(0, (LIMITS.totalVideoLimit || 5) - used);
    }

    return { success: true, result, jobId };
  } catch (error) {
    activeJobs.delete(jobId);

    if (authClient.serverUrl && authClient.isLoggedIn()) {
      try {
        await authClient.refundJob('ssultoon', error.message === 'CANCELLED_BY_USER' ? 'cancelled' : 'failed');
      } catch (e) {}
    }

    if (error.message === 'CANCELLED_BY_USER') {
      return { success: false, cancelled: true, error: '사용자가 취소함' };
    }

    return { success: false, error: error.message };
  }
});

// ===== 🆕 영상 분석 + 대본 생성 (URL에서 음성 추출 후 대본 생성) =====
ipcMain.handle('analyze-and-generate-script', async (event, params) => {
  const { videoUrl, productInfo, hookText, outroText, speechStyle, scriptLength, targetDurationSec, usingImagesOnly } = params;
  
  try {
    const savedConfig = loadConfig();
    const apiKey = savedConfig.groqApiKey || savedConfig.openaiApiKey;
    if (!apiKey) {
      return { success: false, error: 'API 키가 설정되지 않았습니다.' };
    }
    
    // 🆕 이미지만 있으면 videoUrl이 빈 문자열이어도 OK
    if (!usingImagesOnly && (!videoUrl || !videoUrl.trim())) {
      return { success: false, error: '영상 URL 또는 파일을 입력해주세요.' };
    }
    
    // 🆕 이미지만 있으면 제품 정보 필수
    if (usingImagesOnly && (!productInfo || productInfo.trim().length < 10)) {
      return { success: false, error: '이미지만 있는 경우 제품 정보를 자세히 입력해주세요 (10자 이상)' };
    }
    
    const workDir = getWorkDir();
    const jobId = 'script-' + Date.now();
    const jobDir = path.join(workDir, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    
    // 진행 상황 전송
    const sendProgress = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('script-generation-progress', { message: msg });
      }
    };
    
    sendProgress(usingImagesOnly ? '🖼️ 제품 정보 분석 중...' : '📥 영상 준비 중...');
    
    // 1. 영상 준비 (URL이면 다운로드, 로컬 파일이면 복사)
    const videoPath = path.join(jobDir, 'video.mp4');
    const isUrl = !usingImagesOnly && /^https?:\/\//i.test((videoUrl || '').trim());
    
    // 🆕 이미지만 있으면 파일/오디오 처리 전체 스킵
    if (usingImagesOnly) {
      console.log('[script-gen] 🖼️ 이미지 전용 모드 - 파일/오디오 처리 스킵');
    } else if (isUrl) {
      // URL이면 yt-dlp로 다운로드
      sendProgress('📥 영상 다운로드 중...');
      const ytdlp = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      
      try {
        await new Promise((resolve, reject) => {
          const { spawn } = require('child_process');
          const proc = spawn(ytdlp, [
            videoUrl.trim(),
            '-o', videoPath,
            '-f', 'best[ext=mp4]/best',
            '--no-playlist', '--quiet'
          ]);
          proc.on('close', code => {
            if (code === 0 && fs.existsSync(videoPath)) {
              resolve();
            } else {
              reject(new Error('다운로드 실패 (code: ' + code + ')'));
            }
          });
          proc.on('error', reject);
        });
      } catch (e) {
        return { success: false, error: '영상 다운로드 실패: ' + e.message };
      }
    } else {
      // 🆕 로컬 파일이면 복사만
      sendProgress('📁 파일 확인 중...');
      try {
        const localPath = videoUrl.trim();
        console.log(`[script-gen] 로컬 파일 경로: "${localPath}"`);
        
        if (!fs.existsSync(localPath)) {
          return { success: false, error: '파일을 찾을 수 없습니다: ' + localPath };
        }
        
        // 파일 확장자 확인
        const ext = path.extname(localPath).toLowerCase();
        const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        
        if (imageExts.includes(ext)) {
          return { 
            success: false, 
            error: `📸 이미지 파일(${ext})은 쇼핑 쇼츠에서 사용할 수 없습니다!\n\n쇼핑 쇼츠는 영상 파일이 필요합니다.\n\n💡 이미지로 영상 만들기는 5월 출시 예정인 "썰툰 모드"에서 가능합니다.\n\n✅ mp4, mov 등 영상 파일을 업로드해주세요.` 
          };
        }
        
        if (!videoExts.includes(ext)) {
          return { success: false, error: `지원하지 않는 파일 형식입니다: ${ext}\n지원 형식: mp4, mov, avi, mkv, webm, flv, wmv, m4v` };
        }
        
        // 파일 크기 체크 (0바이트 파일 방지)
        const stats = fs.statSync(localPath);
        if (stats.size === 0) {
          return { success: false, error: '파일이 비어있습니다 (0바이트)' };
        }
        console.log(`[script-gen] 파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        
        // 파일 복사
        fs.copyFileSync(localPath, videoPath);
        
        // 복사 후 검증
        if (!fs.existsSync(videoPath)) {
          return { success: false, error: '파일 복사 실패: 대상 파일이 생성되지 않았습니다' };
        }
        const copiedStats = fs.statSync(videoPath);
        if (copiedStats.size === 0) {
          return { success: false, error: '파일 복사 실패: 복사된 파일이 비어있습니다' };
        }
        console.log(`[script-gen] ✅ 로컬 파일 복사 완료: ${videoPath} (${(copiedStats.size / 1024 / 1024).toFixed(2)}MB)`);
      } catch (e) {
        console.error('[script-gen] 파일 처리 실패:', e);
        return { success: false, error: '파일 읽기 실패: ' + e.message };
      }
    }
    
    // 🆕 최종 videoPath 검증 (이미지 전용 모드는 스킵)
    if (!usingImagesOnly && !fs.existsSync(videoPath)) {
      return { success: false, error: '영상 파일 준비 실패: ' + videoPath };
    }
    
    // 🆕 1.5 영상 길이 측정 (이미지 전용 모드는 스킵 → 기본값 사용)
    let videoDurationSec = 0;
    if (!usingImagesOnly) {
      sendProgress('📏 영상 길이 확인 중...');
      try {
        const { spawn } = require('child_process');
        const ffprobe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
        videoDurationSec = await new Promise((resolve) => {
          const proc = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath]);
          let out = '';
          proc.stdout.on('data', d => out += d.toString());
          proc.on('close', () => {
            const dur = parseFloat(out.trim());
            resolve(isFinite(dur) && dur > 0 ? dur : 0);
          });
          proc.on('error', () => resolve(0));
        });
        console.log(`[script-gen] 영상 길이: ${videoDurationSec.toFixed(1)}초`);
      } catch (e) {
        console.warn('영상 길이 측정 실패:', e.message);
      }
    } else {
      console.log('[script-gen] 🖼️ 이미지 전용 모드 - 영상 길이 측정 스킵');
    }
    
    sendProgress(usingImagesOnly ? '📝 대본 생성 준비 중...' : '🎤 음성 추출 중...');
    
    // 2. 오디오 추출 (이미지 전용 모드는 스킵)
    const audioPath = path.join(jobDir, 'audio.mp3');
    let ffmpegPath = 'ffmpeg';
    
    if (!usingImagesOnly) {
      try {
        ffmpegPath = require('ffmpeg-static');
      } catch (e) {
        console.log('ffmpeg-static 없음, 시스템 ffmpeg 사용');
      }
      
      // 🆕 ffmpeg 실행 파일 존재 확인
      if (ffmpegPath && ffmpegPath !== 'ffmpeg' && !fs.existsSync(ffmpegPath)) {
        console.warn(`[script-gen] ffmpeg-static 경로 존재하지 않음: ${ffmpegPath}, 시스템 ffmpeg로 폴백`);
        ffmpegPath = 'ffmpeg';
      }
      
      console.log(`[script-gen] ffmpeg 경로: ${ffmpegPath}`);
      console.log(`[script-gen] 입력 영상: ${videoPath}`);
      console.log(`[script-gen] 출력 오디오: ${audioPath}`);
      
      try {
        await new Promise((resolve, reject) => {
          const { spawn } = require('child_process');
          let stderrOutput = '';
          
          const proc = spawn(ffmpegPath, [
            '-i', videoPath,
            '-vn', '-acodec', 'libmp3lame', '-ar', '44100', '-ac', '1', '-b:a', '192k',
            '-y', audioPath
          ]);
          
          proc.stderr.on('data', (data) => {
            stderrOutput += data.toString();
          });
          
          proc.on('close', code => {
            if (code === 0 && fs.existsSync(audioPath)) {
              const audioSize = fs.statSync(audioPath).size;
              console.log(`[script-gen] ✅ 오디오 추출 완료: ${(audioSize / 1024 / 1024).toFixed(2)}MB`);
              resolve();
            } else {
              console.error(`[script-gen] ❌ ffmpeg 실패 (code: ${code})`);
              console.error(`[script-gen] stderr 마지막 800자:\n${stderrOutput.slice(-800)}`);
              
              let errorMsg = `오디오 추출 실패 (code: ${code})`;
              if (stderrOutput.includes('No such file')) {
                errorMsg = '영상 파일을 찾을 수 없습니다';
              } else if (stderrOutput.includes('Invalid data')) {
                errorMsg = '영상 파일이 손상되었거나 지원하지 않는 형식입니다';
              } else if (stderrOutput.includes('Permission denied')) {
                errorMsg = '파일 접근 권한이 없습니다';
              } else if (stderrOutput.includes('does not contain any stream')) {
                errorMsg = '영상에 오디오 트랙이 없습니다';
              } else if (stderrOutput.includes('moov atom not found')) {
                errorMsg = '영상 파일이 손상되었습니다 (moov atom)';
              }
              
              reject(new Error(errorMsg));
            }
          });
          
          proc.on('error', (err) => {
            console.error(`[script-gen] ffmpeg 실행 에러:`, err);
            if (err.code === 'ENOENT') {
              reject(new Error('ffmpeg를 찾을 수 없습니다. 프로그램 재설치가 필요할 수 있습니다.'));
            } else {
              reject(err);
            }
          });
        });
      } catch (e) {
        return { success: false, error: e.message };
      }
    } else {
      console.log('[script-gen] 🖼️ 이미지 전용 모드 - 오디오 추출 스킵');
    }
    
    // 3. Whisper로 음성 인식 (이미지 전용 모드는 스킵)
    const { transcribeAudio } = require('./processor');
    let transcript = '';
    
    if (!usingImagesOnly) {
      sendProgress('🧠 음성 인식 중 (Whisper)...');
      try {
        const groqKey = savedConfig.groqApiKey;
        if (!groqKey) {
          throw new Error('Groq API 키가 필요합니다');
        }
        const result = await transcribeAudio(audioPath, 'auto', groqKey, (stage, pct, msg) => {
          sendProgress(msg);
        });
        transcript = result.text || '';
      } catch (e) {
        console.warn('Whisper 실패:', e.message);
        transcript = '';
      }
    } else {
      console.log('[script-gen] 🖼️ 이미지 전용 모드 - Whisper 스킵');
    }
    
    sendProgress('✨ AI 대본 생성 중...');
    
    // 🆕 4. 대본 생성 - 영상 길이 기반 계산
    // 한국어 읽기 속도: 존댓말 3.5자/초, 반말 4.0자/초
    const cps = speechStyle === 'formal' ? 3.5 : 4.0;
    
    // 🆕 쇼핑 쇼츠 최대 길이 제한: 90초 (1분 30초)
    // 이유: LLM max_tokens 한계 + 긴 대본 품질 저하 + 쇼츠 최적 길이
    const MAX_SHOPPING_DURATION = 90;
    
    // 목표 길이 결정: targetDurationSec > videoDurationSec > 프리셋
    let effectiveDuration = null;
    let durationCapped = false;  // 🆕 90초로 캡됐는지 표시
    
    if (targetDurationSec && targetDurationSec > 0) {
      effectiveDuration = Math.min(targetDurationSec, MAX_SHOPPING_DURATION);
      if (targetDurationSec > MAX_SHOPPING_DURATION) durationCapped = true;
    } else if (videoDurationSec && videoDurationSec > 0) {
      effectiveDuration = Math.min(videoDurationSec, MAX_SHOPPING_DURATION);
      if (videoDurationSec > MAX_SHOPPING_DURATION) durationCapped = true;
    }
    
    if (durationCapped) {
      console.log(`[script-gen] ⚠️ 영상 길이가 ${MAX_SHOPPING_DURATION}초를 초과 (원본 ${(targetDurationSec || videoDurationSec).toFixed(1)}초) → ${MAX_SHOPPING_DURATION}초로 제한`);
      sendProgress(`⚠️ 쇼핑 쇼츠는 최대 ${MAX_SHOPPING_DURATION}초까지 지원 (자동 조정됨)`);
    }
    
    let targetChars, minChars, targetLines;
    if (effectiveDuration) {
      // 🆕 TTS는 +10% 빨라서 재생되므로, 영상 길이의 100% * 1.1 = 110%만큼 말할 수 있음
      // 안전 마진 5% → 영상 길이 × 1.05 × cps 로 계산
      // 기존 85% → TTS 속도 고려하면 너무 짧음 (대본이 5~6초 일찍 끝남)
      const effectiveCps = cps * 1.1; // TTS +10% 속도 반영
      const usableDuration = effectiveDuration * 1.0; // 영상의 100% 활용
      targetChars = Math.round(usableDuration * effectiveCps);
      minChars = Math.round(targetChars * 0.90);
      // 자막 개수: 영상 길이 / 1.5초 (평균 자막 1개당 1.5초 - 더 촘촘하게)
      targetLines = Math.max(10, Math.round(effectiveDuration / 1.5));
      console.log(`[script-gen] 영상길이 ${effectiveDuration.toFixed(1)}초 → ${minChars}~${targetChars}자, 자막 ${targetLines}개 (TTS ${effectiveCps.toFixed(1)}자/초 기준)`);
    } else {
      // 폴백
      targetChars = scriptLength === 'long' ? 300 : 220;
      minChars = scriptLength === 'long' ? 250 : 180;
      targetLines = scriptLength === 'long' ? 20 : 14;
      console.log(`[script-gen] 프리셋 ${scriptLength} → ${minChars}~${targetChars}자`);
    }
    
    // 🆕 후킹/마무리 글자수를 빼고 "본문 목표" 계산
    // 사용자가 고정 문구를 지정했으면 그 글자수만큼 빼서 본문 목표 설정
    const hookLen = (hookText || '').replace(/\s/g, '').length;
    const outroLen = (outroText || '').replace(/\s/g, '').length;
    const fixedLen = hookLen + outroLen;
    
    let bodyTargetChars = targetChars;
    let bodyMinChars = minChars;
    let bodyTargetLines = targetLines;
    
    if (fixedLen > 0) {
      bodyTargetChars = Math.max(50, targetChars - fixedLen);
      bodyMinChars = Math.max(40, minChars - fixedLen);
      // 후킹/마무리가 각각 1~2자막 정도 차지한다고 보고 줄 수도 약간 줄임
      const fixedLines = (hookText ? 1 : 0) + (outroText ? 1 : 0);
      bodyTargetLines = Math.max(6, targetLines - fixedLines);
      console.log(`[script-gen] 🎯 고정문구 ${fixedLen}자 (후킹 ${hookLen}, 마무리 ${outroLen}) → 본문목표 ${bodyMinChars}~${bodyTargetChars}자, 본문자막 ${bodyTargetLines}개`);
    }
    
    const speechInstruction = speechStyle === 'formal' 
      ? '존댓말 (~입니다, ~해요, ~드려요)'
      : '반말 (친근한 톤: ~야, ~해, ~임, ~거든, ~잖아)';
    
    const transcriptSection = transcript 
      ? `**[원본 영상 내용]**
${transcript}

위 내용을 참고해서 한국 MZ세대가 좋아하는 스타일의 광고 카피로 새롭게 작성하세요.
원본을 번역하지 말고, 핵심만 뽑아서 재창작하세요.`
      : '';
    
    // 🆕 영상 길이 안내 (강조!) - 고정문구 포함해서 안내
    const durationSection = effectiveDuration 
      ? (fixedLen > 0
          ? `**🎯 영상 길이: ${effectiveDuration.toFixed(1)}초**
**전체 대본 총 ${minChars}~${targetChars}자** (공백 제외, 영상 길이에 맞춘 값)
- 그 중 후킹+마무리 고정문구 = ${fixedLen}자 (이미 확정됨, 글자수에 포함)
- **AI가 작성할 본문 = ${bodyMinChars}~${bodyTargetChars}자** (이만큼만 써주세요!)
- 총 자막 약 ${targetLines}개 (고정문구 자막 포함)
영상 ${effectiveDuration.toFixed(1)}초 동안 자막이 끊임없이 나와야 함!
`
          : `**🎯 영상 길이: ${effectiveDuration.toFixed(1)}초**
반드시 ${minChars}~${targetChars}자로 작성 (공백 제외).
영상 ${effectiveDuration.toFixed(1)}초 동안 자막이 끊임없이 나와야 함.
약 ${targetLines}개 자막 (한 줄 = 한 자막).
`)
      : '';
    
    const prompt = `당신은 한국 틱톡/인스타 릴스/유튜브 쇼츠 전문 카피라이터입니다.
바이럴 되는 쇼츠 광고 대본을 작성하세요.

${productInfo ? `
🔴🔴🔴 **가장 중요한 정보 - 제품** 🔴🔴🔴
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
판매할 제품: **${productInfo}**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ 반드시 이 제품에 맞는 대본 작성!
- 제품 종류를 확실히 파악: "${productInfo}"
- 아래 음성 내용이나 예시와 달라도 **제품 정보 최우선**
- 이 제품의 실제 용도/장점만 언급
- 엉뚱한 제품 단어 섞지 말 것!

예시:
❌ "가습기"인데 "흡입력", "먼지", "청소" 쓰면 안 됨
❌ "세탁기"인데 "바람", "시원함" 쓰면 안 됨
✅ 제품에 맞는 단어만 사용 ("${productInfo}"에 맞게!)

🔢 **숫자 사용 가이드**:
- 숫자는 **제품 정보에 있을 때만** 자연스럽게 활용 (무리해서 넣지 말기)
- 쓸 때는 **아라비아 숫자 그대로** 사용 (한글 변환 금지)
- ✅ "50%" (NOT "오십 퍼센트")
- ✅ "300ml" (NOT "삼백 밀리리터")
- ✅ "40분" (NOT "사십분")
- 숫자 없어도 자연스러운 대본이면 OK

` : ''}${durationSection}
${transcriptSection}

**[스타일]**
- ${speechInstruction}
- 한국 MZ세대 말투 (진짜, 레알, 미쳤다, 개이득, 찐템, 갓성비 등 자연스럽게)
- 짧고 임팩트 있게
- 친구한테 추천하는 느낌

**[구조 - 자막 개수 많이 뽑기]**
**[🎯 대본 내용 - 정보성 + 구매 욕구 자극]**
1. 후킹 (1~2자막): 시선 끌기 ("야 이거 뭐야", "이거 미쳤음")
2. 공감/문제 (2~3자막): 진짜 흔한 고민 (건조해서 목 아프고 피부 땅김 등)
3. 문제 상세 (2~3자막): 왜 그 문제가 힘든지 공감 유도
4. 제품의 **구체적 기능** (3~4자막): 
   - 실제 수치나 기능 (용량/시간/성능)
   - 이 제품만의 특별한 점 (다른 제품과 차별화)
   - 어떻게 작동하는지 간단히
5. **실제 사용 효과** (3~4자막):
   - 써봤을 때 체감되는 변화
   - 일상이 어떻게 달라지는지
   - 구체적인 상황 묘사
6. 장점 **정보성** (2~3자막):
   - 안전성/편의성/내구성 등 실용적 정보
   - 왜 이 제품을 써야 하는지 이유
7. 가격/가성비 (1~2자막): 자연스럽게 언급
8. 자연스러운 마무리 (1~2자막): 제품 특징 한 번 더 강조 or 공감

⚠️ 구매 유도 CTA는 선택사항!
- 후킹/마무리 멘트는 **사용자가 따로 설정**할 수 있음
- 대본에서는 **제품 정보 전달**에 집중
- "링크 확인", "구매하세요" 같은 CTA는 **넣지 말기!**
- 자연스러운 본문으로 마무리 (구매 유도 X)

⚠️ **"꼭 사야 한다"식 강매 멘트 금지!** 
- ❌ "안 사면 후회", "빨리 사야 해", "지금 안 사면 손해"
- ❌ "링크 달아뒀으니까 확인해봐", "구매 링크 달아놨음" (CTA)
- ✅ 제품 장점/특징 자연스럽게 전달

대신 **"왜 이 제품이 좋은지 이유"를 정보성으로 전달**하는 게 핵심!
시청자가 "어, 이거 나한테 필요하겠는데?" 라고 **스스로 느끼게** 만들기.

**[자막 형식]**
- 한 줄 = 한 자막 (줄바꿈으로 구분)
- 자막 하나당 10~18자 (너무 짧은 단답 금지, 자연스러운 구절로)
${fixedLen > 0
  ? `- 🔴 **AI가 쓸 본문: ${bodyMinChars}~${bodyTargetChars}자** (후킹/마무리 제외한 순수 본문)
- 🔴 **전체 합계: ${minChars}~${targetChars}자** (후킹 ${hookLen}자 + 본문 + 마무리 ${outroLen}자)
- 🔴 **본문 자막: ${bodyTargetLines}개 정도** (후킹/마무리 자막 제외)`
  : `- 🔴 **총 ${minChars}~${targetChars}자** (꼭 지킬 것!)
- 🔴 **총 자막 ${targetLines}개 정도**`}
- 문장 끝에 마침표(.) 대신 느낌표/물음표/종결어미로 자연스럽게 끝맺기
  (예: "~이야", "~임", "~지", "~거든", "~어", "~좋아" 등)
${hookText ? `- 🔴 **첫 문장에만 1번 나와야 함**: "${hookText}" (중간이나 마지막에 또 나오면 안 됨, 본문 글자수에서 제외!)` : ''}
${outroText ? `- 🔴 **마지막 문장에만 1번 나와야 함**: "${outroText}" (중간에 나오면 안 됨, 본문 글자수에서 제외!)` : ''}

🚫🚫🚫 절대 금지 (위반 시 실패 처리) 🚫🚫🚫
- 영어 단어 금지 (clean, good, pound, dollar 등)
- 중국어/한자 금지 (力, 的, 很 등)  
- 일본어 금지 (の, です 등)
- 아랍어/기타 외국어 금지
- 반드시 100% 순수 한글만 사용!
- 외국어 → 한국어로 번역 (예: solve → 해결, clean → 깨끗)

**[🚨 경고 - 제품을 잘못 파악하면 안 됨!]**
- 제품 정보를 **반드시 확인**하고, 그 제품에 맞는 내용으로 작성
- 청소기/세탁기/가습기/선풍기/조리기구 등 제품마다 장점/특징 다름!
- "청소" "먼지" "흡입력" 같은 단어는 **청소기 전용**
- "세탁" "빨래" "옷" 같은 단어는 **세탁기/세탁 제품 전용**  
- "가습" "습도" "수증기" 같은 단어는 **가습기 전용**
- "바람" "시원" 같은 단어는 **선풍기/에어컨 전용**
- 엉뚱한 제품 특징 섞지 마세요!

**[✅ 좋은 대본 예시 - 가습기 (시작 멘트 예 1)]**
가습기 고민하는 사람들 진짜 주목해야 됨
겨울 되면 진짜 건조해서 미치겠잖아
아침에 일어나면 목도 칼칼하고 피부도 땅기고
이런 사람들한테 이 가습기 진짜 추천이야
한 번 틀어놓으면 실내 공기가 확 달라져
용량도 적당해서 침실에 두기 딱 좋고
무드등 켜놓으면 분위기까지 미침
무소음이라 잠잘 때도 방해 전혀 안 돼
건조한 계절에 진짜 유용한 아이템임

**[✅ 좋은 대본 예시 - 무선 청소기 (시작 멘트 예 2)]**
청소할 때마다 스트레스 받는 사람들 봐봐
선 없는 무선 청소기 진짜 신세계야
흡입력 미쳐서 머리카락 한 번에 다 빨려
배터리 완충하면 40분은 거뜬하고
헤드 갈아끼우면 차량까지 청소 가능
1kg도 안 되는 무게라 한 손으로 들고 다닐 수 있음
일반 청소기 쓰던 사람들은 진짜 갈아탈 만함
청소 스트레스 싹 사라지는 제품이야

**[✅ 좋은 대본 예시 - 차량 와이퍼 (시작 멘트 예 3)]**
겨울에 차 운전하는 사람들 이거 알아두면 좋음
눈 오는 날 와이퍼 동결되면 진짜 짜증나잖아
아침에 차 빼려고 보면 와이퍼 다 얼어있고
이 클립만 끼워두면 와이퍼 들어올려서 보관 가능
밤새 눈 와도 와이퍼는 멀쩡함
설치도 진짜 간단해서 5초면 끝나
가격도 부담 없는 수준이고
겨울철 차주들한테는 필수템임

👆 위 예시들의 **공통점**:
- ✅ **첫 줄을 다양하게** (꼭 "야 이거 뭐야"로 시작 X)
  - "가습기 고민하는 사람들..."
  - "청소할 때마다 스트레스 받는..."
  - "겨울에 차 운전하는 사람들..."
  - 이런 식으로 **제품 종류/타깃에 맞게 자연스럽게**
- ✅ **마지막 줄도 다양하게** (꼭 "링크 확인해봐"로 끝 X)
  - "필수템임"
  - "갈아탈 만함"
  - 또는 부드러운 CTA
- ✅ **구체적 수치/정보** 포함
- ✅ **자연스러운 흐름** (뚝뚝 끊김 X)

🚫 **금지 사항** (절대 이렇게 쓰지 마세요!):
- ❌ 매번 "야 이거 뭐야"로 시작 (예시 따라하지 말기, 제품에 맞는 후킹 만들기)
- ❌ 매번 "링크 확인해봐"로 끝 (다양한 마무리 가능)
- ❌ 강매 멘트 ("꼭 사야 한다", "안 사면 손해" 등)
- ❌ 뜻 없는 짧은 단답 ("좋아요", "개이득", "찐임" 등 1줄짜리)

⚠️ 위 예시는 **참고용**입니다. 실제 제품 정보에 맞게 **완전히 다른 내용**으로 작성하세요!
⚠️ 후킹/마무리는 사용자가 따로 설정할 수 있으니, 본문은 자연스러운 흐름에 집중!

"/" 절대 쓰지 말 것! (한 줄 = 한 자막)

(30~40초 영상이면 이보다 적게, 60초+ 영상이면 이보다 많게)

**[나쁜 예시 - 절대 이렇게 쓰지 마세요]**
- 뚝뚝 끊기는 단어만: "가습기야" "좋음" "개이득" ← 의미 없음
- 너무 짧은 대본 (5~6줄만): 영상 남음
- "간편하게 solve됨" ❌ → "간편하게 해결됨" ✅
- "청소力" ❌ → "청소력" ✅  
- "真的 좋아" ❌ (중국어) → "진짜 좋아" ✅
- "बदल" ❌ (힌디어) → "바꾸다" ✅

✅ **숫자는 아라비아 숫자 그대로 써도 됨** (한글로 바꾸지 말 것!)
  - "50~60%" ✅ (NOT "오십에서 육십 퍼센트")
  - "25000PA" ✅ (NOT "이만오천 파스칼")
  - "1000원" ✅ (NOT "천원")
  - "40분" ✅ (NOT "사십분")
  → 숫자는 **자막에 그대로 표시**되므로 그대로 쓰세요!

🚫 **절대 금지 - 억지로 길이 늘리기**:
잘못된 예시:
  "진짜 좋다고 생각해"
  "진짜 좋다니까"  ← 같은 말 반복 ❌
  "진짜로 만족스럽다고 생각해"  ← 또 반복 ❌
  "구매하기"
  "링크클릭"
  "바로가기"
  "구매하기"  ← 명령어 반복 ❌
  
→ 올바른 방법: 각 줄이 **완전히 다른 내용**이어야 함 (문제→해결→장점→사용법→가격→CTA)

✅ **한 줄 = 한 자막**:
각 줄을 줄바꿈으로 구분하면 각각 별도 자막으로 표시됩니다.
자연스럽고 읽기 좋게 작성하세요.

⚠️ 예시 문장을 복사하지 말고, **제품 정보에 맞는 내용**을 직접 작성하세요!

🔴 **중요: ${effectiveDuration 
  ? (fixedLen > 0
      ? `영상이 ${effectiveDuration.toFixed(1)}초. 후킹/마무리는 고정(${fixedLen}자). 본문은 ${bodyMinChars}~${bodyTargetChars}자로 꼭 채워줘! 전체 합치면 ${minChars}~${targetChars}자 / 자막 ${targetLines}개`
      : `영상이 ${effectiveDuration.toFixed(1)}초니까 반드시 ${targetLines}개 자막, ${minChars}~${targetChars}자 채워야 함!`)
  : '풍성하게 채워 쓰기!'}**

🔴 **한 줄 = 한 자막** (줄바꿈으로 구분)
🔴 **각 줄은 서로 다른 내용 - 같은 말 반복 절대 금지!**
🔴 **100% 순수 한글만 (외국어 한 글자도 섞지 말 것)**
🚫 **절대 "/" 슬래시 문자 쓰지 마세요!** 자막 구분은 오직 줄바꿈으로만!
🚫 **"야 이거 진짜/안 사면" 같이 "/" 쓰면 안 됨!** → "야 이거 진짜 안 사면" 이렇게!

대본만 출력 (설명 없이):`;

    // 🆕 LLM 호출 함수 (사용자가 선택한 Provider 따라감)
    // savedConfig.llmProvider = 'groq' | 'openai' | 'claude' | 'gemini' (renderer.html에서 저장)
    const userProvider = savedConfig.llmProvider || 'groq';

    // Provider별 설정
    const providerConfigs = {
      groq: {
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
        keyField: 'groqApiKey',
        name: 'Groq',
      },
      openai: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o-mini',
        keyField: 'openaiApiKey',
        name: 'OpenAI',
      },
    };

    let provider = userProvider;
    let pConfig = providerConfigs[provider];

    // 사용자 선택한 provider 키가 없으면 → 다른 키로 fallback
    if (!pConfig || !savedConfig[pConfig.keyField]) {
      if (savedConfig.groqApiKey) { provider = 'groq'; pConfig = providerConfigs.groq; }
      else if (savedConfig.openaiApiKey) { provider = 'openai'; pConfig = providerConfigs.openai; }
      else {
        throw new Error('❌ API 키가 없습니다.\n💡 해결: 좌측 메뉴 → 설정 → API 키 → Groq 또는 OpenAI 키를 입력해주세요.');
      }
    }

    const endpoint = pConfig.endpoint;
    const model = savedConfig.llmModel || pConfig.defaultModel;
    const key = savedConfig[pConfig.keyField];
    const providerName = pConfig.name;

    console.log(`[script-gen] LLM 사용: ${providerName} / ${model}`);

    const axios = require('axios');
    
    // 🆕 429 Rate Limit 자동 대기 + 재시도
    const callLLM = async (currentPrompt, retryCount = 0) => {
      try {
        // 🆕 시스템 메시지로 제품 정보 최우선 강조
        const systemMsg = productInfo 
          ? `당신은 한국 쇼츠 광고 대본 전문가입니다. 사용자가 판매할 제품은 "${productInfo}"입니다. 이 제품의 실제 용도/특징에 맞는 대본만 작성하세요. 예시 문장을 복사하지 말고, 제품에 맞는 단어와 내용으로 직접 작성하세요.`
          : `당신은 한국 쇼츠 광고 대본 전문가입니다. 영상에 나오는 제품에 맞는 대본을 작성하세요.`;
        
        const res = await axios.post(endpoint, {
          model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: currentPrompt }
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }, {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,  // 60초 타임아웃
        });
        let s = res.data.choices[0].message.content.trim();
        s = s.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
        return s;
      } catch (error) {
        const status = error.response?.status;
        const code = error.response?.data?.error?.code;
        const msg = error.response?.data?.error?.message || error.message || '';
        console.error(`[script-gen ${providerName} ERROR]`, { status, code, msg });

        // 🆕 429/5xx만 재시도, 최대 2회 (이전 60초 → 최대 8초로 단축)
        const retryable = status === 429 || (status >= 500 && status < 600);
        if (retryable && retryCount < 2) {
          // retry-after 헤더 우선, 없으면 짧은 지수 백오프
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          let waitSec;
          if (retryAfterHeader) {
            const parsed = parseFloat(retryAfterHeader);
            waitSec = isFinite(parsed) && parsed > 0 ? Math.min(15, Math.ceil(parsed)) : 4;
          } else {
            waitSec = retryCount === 0 ? 3 : 6;
          }
          console.log(`[script-gen] ${providerName} 일시 오류 (${status}). ${waitSec}초 후 재시도 (${retryCount + 1}/2)`);
          sendProgress(`⏳ ${providerName} 일시 대기 (${waitSec}초)... ${retryCount + 1}/2`);
          await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
          return callLLM(currentPrompt, retryCount + 1);
        }

        // 🆕 친절한 에러 메시지 (status별)
        let friendly;
        if (status === 401) {
          friendly = `❌ ${providerName} API 키가 잘못됐거나 만료됐습니다.\n💡 해결: 좌측 메뉴 → 설정 → ${providerName} API Key 다시 입력 후 저장 → 앱 재시작`;
        } else if (status === 402 || code === 'insufficient_quota') {
          friendly = `❌ ${providerName} 크레딧/사용량이 부족합니다.\n💡 해결: ① ${providerName === 'Groq' ? '1~24시간 후 재시도 (무료 한도 리셋)' : '결제하고 다시 시도'}\n② 또는 다른 LLM Provider 선택 (설정 → 번역에 사용할 LLM)`;
        } else if (status === 403) {
          friendly = `❌ ${providerName} 모델 권한이 없습니다.\n💡 해결: 설정 → 모델명 직접 지정란을 비우고 기본값 사용해보세요.`;
        } else if (status === 429) {
          friendly = `❌ ${providerName} 요청 한도 초과 (재시도 ${2}회 모두 실패).\n💡 해결: ① 2~3분 후 재시도\n② 또는 다른 LLM Provider로 변경 (설정 → 번역에 사용할 LLM)\n${providerName === 'Groq' ? '③ OpenAI Key 입력 시 자동 fallback 가능' : ''}`;
        } else if (status === 400) {
          friendly = `❌ ${providerName} 요청 형식 오류.\n💡 해결: 설정 → 모델명을 비우고 기본값 사용 또는 다른 Provider 선택\n📋 상세: ${msg}`;
        } else if (status >= 500) {
          friendly = `❌ ${providerName} 서버 일시 장애 (코드 ${status}).\n💡 해결: 5~10분 후 재시도, 계속 안 되면 다른 Provider 변경`;
        } else if (!status) {
          friendly = `❌ ${providerName} 서버 연결 실패 (네트워크).\n💡 해결: 인터넷 연결/VPN/방화벽 확인`;
        } else {
          friendly = `❌ ${providerName} 오류 (코드 ${status}): ${msg}\n💡 해결: 잠시 후 재시도하거나 다른 Provider 선택`;
        }
        throw new Error(friendly);
      }
    };
    
    let script = await callLLM(prompt);
    let scriptLen = script.replace(/\s/g, '').length;
    
    // 🆕 대본 품질 검증 함수 (강화)
    const validateScript = (s) => {
      const issues = [];
      
      // 1) 외국어 검출 (한자/일본어/아랍어/태국어/키릴/히브리어/힌디어)
      if (/[\u4e00-\u9fff]/.test(s)) issues.push('한자 포함');
      if (/[\u3040-\u309f\u30a0-\u30ff]/.test(s)) issues.push('일본어 포함');
      if (/[\u0600-\u06ff]/.test(s)) issues.push('아랍어 포함');
      if (/[\u0e00-\u0e7f]/.test(s)) issues.push('태국어 포함');
      if (/[\u0400-\u04ff]/.test(s)) issues.push('키릴 문자 포함');
      if (/[\u0590-\u05ff]/.test(s)) issues.push('히브리어 포함');
      if (/[\u0900-\u097f]/.test(s)) issues.push('힌디어(데바나가리) 포함');  // 🆕
      
      // 영어 단어 (3글자 이상 연속 알파벳)
      const englishMatches = s.match(/[a-zA-Z]{3,}/g);
      if (englishMatches && englishMatches.length > 0) {
        issues.push(`영어 포함: ${englishMatches.slice(0, 3).join(', ')}`);
      }
      
      const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
      
      // 2) 반복 패턴 검출 (같은 시작 단어가 4번 이상 반복 - 기준 강화: 5→4)
      const firstWords = lines.map(l => l.split(/[\s\/]/)[0]).filter(Boolean);
      const wordCounts = {};
      firstWords.forEach(w => wordCounts[w] = (wordCounts[w] || 0) + 1);
      const maxRepeat = Math.max(...Object.values(wordCounts), 0);
      if (maxRepeat >= 4) {
        const repeatedWord = Object.entries(wordCounts).find(([w, c]) => c === maxRepeat)[0];
        issues.push(`"${repeatedWord}" ${maxRepeat}번 반복`);
      }
      
      // 3) 🆕 라인 전체 중복 검출 강화 (10% 이상)
      const uniqueLines = new Set(lines);
      const dupRatio = 1 - (uniqueLines.size / lines.length);
      if (dupRatio > 0.10 && lines.length > 5) {
        issues.push(`라인 중복 ${(dupRatio * 100).toFixed(0)}%`);
      }
      
      // 4) 🆕 부분 문자열 중복 (비슷한 표현 반복)
      // "진짜 좋다고 생각해"가 "진짜 좋다니까"로도 나오는 경우 잡기 위해
      // 3자 이상 공통 부분이 4번 이상 나오면 문제
      const phraseCounts = new Map();
      for (const line of lines) {
        // 5자 이상 부분 문자열 추출
        for (let i = 0; i <= line.length - 5; i++) {
          const sub = line.substring(i, i + 5);
          phraseCounts.set(sub, (phraseCounts.get(sub) || 0) + 1);
        }
      }
      let maxPhraseRepeat = 0;
      let repeatedPhrase = '';
      phraseCounts.forEach((count, phrase) => {
        if (count > maxPhraseRepeat) {
          maxPhraseRepeat = count;
          repeatedPhrase = phrase;
        }
      });
      if (maxPhraseRepeat >= 5) {
        issues.push(`"${repeatedPhrase}" 유사구절 ${maxPhraseRepeat}번`);
      }
      
      // (이전 "/" 체크 로직 제거됨 - 대장님 요청으로 "/" 기능 아예 안 씀)
      
      return issues;
    };
    
    // 1차 결과 품질 체크
    const firstIssues = validateScript(script);
    if (firstIssues.length > 0) {
      console.log(`[script-gen] ⚠️ 1차 결과 품질 이슈: ${firstIssues.join(', ')}`);
    }
    
    // 🆕 재시도 조건: (1) 너무 짧거나 (2) 품질 이슈 있으면 재시도
    const tooShort = effectiveDuration && scriptLen < minChars * 0.70;
    const hasQualityIssue = firstIssues.length > 0;
    const needRetry = tooShort || hasQualityIssue;
    
    if (needRetry) {
      const reason = tooShort 
        ? `너무 짧음 (${scriptLen}자 < ${Math.round(minChars * 0.70)}자)`
        : `품질 이슈: ${firstIssues.join(', ')}`;
      console.log(`[script-gen] ⚠️ 재시도 발동: ${reason}`);
      sendProgress('🔄 대본 품질 문제로 재생성 중...');
      
      // 🆕 재시도 프롬프트: 구체적 문제 지적
      let retryReason = '';
      if (tooShort) {
        retryReason += `- 대본이 ${scriptLen}자로 너무 짧음 (목표 ${minChars}~${targetChars}자)\n`;
      }
      if (firstIssues.some(i => i.includes('한자') || i.includes('일본어') || i.includes('태국어') || i.includes('키릴') || i.includes('히브리어') || i.includes('아랍어') || i.includes('힌디어'))) {
        retryReason += `- 🚫 **외국어 문자가 섞여 있음** (한자/일본어/태국어/힌디어 등) → 100% 순수 한글로!\n`;
      }
      if (firstIssues.some(i => i.includes('영어'))) {
        retryReason += `- 🚫 영어 단어가 섞여 있음 → 한국어로만!\n`;
      }
      if (firstIssues.some(i => i.includes('반복') || i.includes('유사구절'))) {
        retryReason += `- 🚫 **같은 말이 계속 반복됨** (예: "진짜 좋다" 여러 번) → 각 줄은 서로 다른 내용이어야 함!\n`;
      }
      if (firstIssues.some(i => i.includes('중복'))) {
        retryReason += `- 🚫 똑같은 문장이 여러 번 나옴 → 모든 줄을 다르게 써야 함!\n`;
      }
      // (이전 "/" 구조불량 재시도 이유 제거됨)
      
      const retryPrompt = prompt + `

**🚨🚨🚨 재생성 이유 🚨🚨🚨**
방금 생성한 대본에 문제가 있음:
${retryReason}

**이번엔 반드시 지켜야 할 것:**
1. 📏 글자수: ${minChars}~${targetChars}자 (절대 넘지 말고, 모자라지도 말 것)
2. 🔤 **100% 순수 한글만** (한자, 일본어, 영어, 태국어 등 외국어 금지)
3. 🔁 **반복 금지** - 각 줄은 완전히 다른 내용
4. 📝 **한 줄 = 한 자막** (줄바꿈으로 자막 구분)
5. 🎯 자연스러운 광고 멘트 (억지로 길이 늘리지 말 것)

**재생성 시 주의:**
- 주어진 "제품 정보"에 **정확히 맞는** 대본 작성
- 예시 문장을 복사하지 말고, 제품에 맞게 **직접 작성**
- 각 줄이 서로 다른 내용, 자연스러운 한국어
- "청소기"인데 "세탁" 쓰거나, "세탁기"인데 "흡입력" 쓰면 안 됨
- 제품 종류를 확실히 이해하고 작성할 것`;
      
      try {
        const retryScript = await callLLM(retryPrompt);
        const retryLen = retryScript.replace(/\s/g, '').length;
        const retryIssues = validateScript(retryScript);
        
        console.log(`[script-gen] 재시도 결과: ${retryLen}자, 이슈: ${retryIssues.join(', ') || '없음'}`);
        
        // 🆕 재시도 결과 채택 조건:
        // - 품질 이슈가 없거나 1차보다 적어야 함
        // - 길이도 기준 근처여야 함 (± 범위)
        const retryBetter = retryIssues.length < firstIssues.length;
        const retryLongEnough = !effectiveDuration || retryLen >= minChars * 0.70;
        
        if (retryIssues.length === 0 && retryLongEnough) {
          // 완벽: 품질 이슈 없음 + 길이 OK
          script = retryScript;
          scriptLen = retryLen;
          console.log(`[script-gen] ✅ 재시도 완벽: 채택`);
        } else if (retryBetter && retryLongEnough) {
          // 개선됨: 이슈 줄었고 길이 OK
          script = retryScript;
          scriptLen = retryLen;
          console.log(`[script-gen] ✅ 재시도 개선: 채택 (이슈 ${firstIssues.length} → ${retryIssues.length})`);
        } else {
          console.log(`[script-gen] ⚠️ 재시도 미개선. 1차 결과 유지.`);
        }
      } catch (e) {
        console.warn('[script-gen] 재시도 실패:', e.message);
      }
    }
    
    // 🆕 최종 후처리: 문제 있는 라인 자동 제거/정리
    let finalLines = script.split('\n').map(l => l.trim()).filter(Boolean);
    
    // 1) 중복 라인 제거 (완전 중복)
    const dedupedLines = [];
    const seenLines = new Set();
    for (const line of finalLines) {
      if (line.length > 5 && seenLines.has(line)) {
        console.log(`[script-gen] 🧹 중복 라인 제거: "${line}"`);
        continue;
      }
      dedupedLines.push(line);
      seenLines.add(line);
    }
    finalLines = dedupedLines;
    
    // 2) 🆕 외국어 포함 처리: 한글 비율에 따라 라인 제거 or 외국어만 제거
    finalLines = finalLines.map(line => {
      // 외국어 문자 감지 (한자/일본어/태국어/아랍어/키릴/히브리어/힌디어)
      const foreignRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\u0600-\u06ff\u0e00-\u0e7f\u0400-\u04ff\u0590-\u05ff\u0900-\u097f]/g;
      const foreignMatches = line.match(foreignRegex);
      
      if (foreignMatches && foreignMatches.length > 0) {
        // 외국어 섞여있으면 → 외국어 문자만 제거하고 한글로 대체
        const cleaned = line.replace(foreignRegex, '').replace(/\s+/g, ' ').trim();
        console.log(`[script-gen] 🧹 외국어 문자 제거: "${line}" → "${cleaned}"`);
        return cleaned;
      }
      
      // 영어 단어 3자+: 해당 라인 제거
      // 🆕 단, 숫자와 조합된 단위(ml, kg, cm, PA 등)는 허용
      const englishOnly = line.match(/[a-zA-Z]{3,}/g);
      if (englishOnly) {
        // 단위로 쓰이는 경우 (예: USB, LED 같은 약어)는 허용
        const allowedUnits = ['USB', 'LED', 'OLED', 'LCD', 'IPS', 'WiFi', 'BT'];
        const hasOnlyAllowed = englishOnly.every(w => 
          allowedUnits.some(u => w.toUpperCase() === u.toUpperCase())
        );
        if (!hasOnlyAllowed) {
          console.log(`[script-gen] 🧹 영어 포함 라인 제거: "${line}"`);
          return null;
        }
      }
      
      return line;
    }).filter(line => line && line.trim().length > 0);
    
    // 🆕 각 라인에서 "/" 제거 (LLM이 무시하고 써도 청소)
    finalLines = finalLines.map(line => {
      if (line.includes('/')) {
        const cleaned = line.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
        console.log(`[script-gen] 🧹 "/" 제거: "${line}" → "${cleaned}"`);
        return cleaned;
      }
      return line;
    }).filter(Boolean);
    
    // 🆕 후킹/마무리 중복 제거 (LLM이 실수로 여러 번 넣은 경우)
    if (hookText && hookText.trim()) {
      const hookTrimmed = hookText.trim();
      let hookFound = 0;
      finalLines = finalLines.filter((line, idx) => {
        if (line.trim() === hookTrimmed) {
          hookFound++;
          if (hookFound > 1) {
            console.log(`[script-gen] 🧹 후킹 중복 제거 (${hookFound}번째): "${line}"`);
            return false;  // 2번째 이상은 제거
          }
        }
        return true;
      });
    }
    if (outroText && outroText.trim()) {
      const outroTrimmed = outroText.trim();
      let outroFound = 0;
      // 뒤에서부터 스캔: 마지막 것만 남기기
      const reversed = [...finalLines].reverse();
      const filteredReversed = reversed.filter(line => {
        if (line.trim() === outroTrimmed) {
          outroFound++;
          if (outroFound > 1) {
            console.log(`[script-gen] 🧹 마무리 중복 제거: "${line}"`);
            return false;
          }
        }
        return true;
      });
      finalLines = filteredReversed.reverse();
    }
    
    script = finalLines.join('\n');
    scriptLen = script.replace(/\s/g, '').length;
    
    const scriptLineCount = script.split('\n').filter(l => l.trim()).length;
    console.log(`[script-gen] ✅ 완료: ${scriptLen}자, ${scriptLineCount}줄 (목표 ${minChars}~${targetChars}자, ${targetLines}개)`);
    
    // 임시 폴더 정리
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch (e) {}
    
    return { 
      success: true, 
      script, 
      transcript,
      // 🆕 통계
      stats: {
        length: scriptLen,
        lines: scriptLineCount,
        subtitles: scriptLineCount,
        target: { min: minChars, max: targetChars, lines: targetLines },
        duration: effectiveDuration,
      }
    };
    
  } catch (error) {
    console.error('영상 분석 + 대본 생성 오류:', error);
    return { success: false, error: error.message };
  }
});

// ===== 🆕 제품 대본 생성 =====
ipcMain.handle('generate-product-script', async (event, params) => {
  try {
    const savedConfig = loadConfig();
    const apiKey = savedConfig.groqApiKey || savedConfig.openaiApiKey;
    if (!apiKey) {
      return { success: false, error: 'API 키가 설정되지 않았습니다. 설정에서 Groq 또는 OpenAI API 키를 입력하세요.' };
    }
    
    const { productInfo, hookText, outroText, speechStyle, scriptLength, videoTranscript, videoDurationSec, targetDurationSec } = params;
    
    // 🆕 영상 길이 기반 정확한 글자수 계산
    // 한국어 읽기 속도: 존댓말 3.5자/초, 반말 4.0자/초 (TTS 기준)
    // 🆕 쇼핑 쇼츠는 임팩트 강한 짧은 자막이 중요 → 자막 개수도 계산
    const cps = speechStyle === 'formal' ? 3.5 : 4.0;
    
    // 목표 길이 결정 우선순위:
    // 1) targetDurationSec (사용자가 직접 지정)
    // 2) videoDurationSec (원본 영상 길이)
    // 3) scriptLength 프리셋 (기존 방식 fallback)
    let effectiveDuration = null;
    if (targetDurationSec && targetDurationSec > 0) {
      effectiveDuration = targetDurationSec;
    } else if (videoDurationSec && videoDurationSec > 0) {
      effectiveDuration = videoDurationSec;
    }

    // 🆕 영상 길이 모르면 짧은 영상 가정 (15초) — LLM이 60초 분량 만드는 사고 방지
    // 진짜 길이는 processor에서 다운로드 후 정확히 측정해서 hardLimit으로 다시 자름
    if (!effectiveDuration) {
      console.warn('[대본생성] ⚠️ 영상 길이 정보 없음 → 일단 15초 기준으로 짧게 생성 (processor에서 정확히 다시 자름)');
      effectiveDuration = 15;
    }
    
    let targetChars, minChars, targetLines;
    if (effectiveDuration) {
      // 🆕 영상 길이 기반 계산 (더 공격적)
      // TTS가 실제로 말하는 시간은 영상의 90%로 늘림 (공백 줄임)
      const usableDuration = effectiveDuration * 0.90;
      targetChars = Math.round(usableDuration * cps);
      minChars = Math.round(targetChars * 0.90);  // 🆕 하한선 90%로 더 좁힘
      
      // 🆕 자막 개수 계산: 쇼핑 쇼츠는 평균 1자막당 1.5~2초
      // 짧고 임팩트 있게 보여주려면 자막 전환이 잦아야 함
      // (줄바꿈으로 구분된 자막 수)
      targetLines = Math.max(8, Math.round(effectiveDuration / 1.8));
      
      console.log(`[대본생성] 영상길이 ${effectiveDuration}초 → ${minChars}~${targetChars}자 (${cps}자/초), 자막 ${targetLines}개 목표`);
    } else {
      // 프리셋 fallback (기존 방식)
      targetChars = scriptLength === 'long' ? 250 : 150;
      minChars = scriptLength === 'long' ? 200 : 100;
      targetLines = scriptLength === 'long' ? 18 : 12;
      console.log(`[대본생성] 프리셋 ${scriptLength} → ${minChars}~${targetChars}자, 자막 ${targetLines}개`);
    }
    
    // 말투 설정
    const speechInstruction = speechStyle === 'formal' 
      ? '존댓말 사용 (~입니다, ~해요, ~드려요)'
      : '반말 사용 (친근하고 편한 말투)';
    
    // 🆕 영상 길이 안내 (강조)
    const durationSection = effectiveDuration 
      ? `**🎯 목표 영상 길이: ${effectiveDuration}초**
이 길이에 맞게 **반드시 ${minChars}~${targetChars}자**로 작성해야 합니다.
너무 짧으면 영상에 공백이 많이 생기고 (절대 안 됨!), 너무 길면 자막이 잘립니다.
`
      : '';
    
    // 원본 영상 음성이 있으면 참고
    const transcriptSection = videoTranscript 
      ? `**원본 영상 음성 (참고용):**
${videoTranscript}

위 내용을 참고해서 광고 카피를 작성하세요. 그대로 쓰지 말고 한국 쇼츠 스타일로 재창작하세요.`
      : '';
    
    const prompt = `당신은 한국 쇼츠 광고 카피라이팅 전문가입니다.
틱톡/인스타/유튜브 쇼츠용 광고 대본을 작성하세요.

${durationSection}
${transcriptSection}

**제품 정보/키워드:**
${productInfo || '(원본 영상 참고)'}

**🔴 매우 중요 - 분량 요구사항 (반드시 준수):**
- **총 글자수: ${minChars}~${targetChars}자 (공백 제외, 절대 지킬 것!)**
- **총 자막 수: 약 ${targetLines}개** (줄바꿈 기준)
- **영상 ${effectiveDuration || '?'}초 동안 자막이 계속 나와야 함** (공백 금지)

**🔴 쇼츠 자막 구조 (임팩트 극대화):**
- **한 줄 = 한 자막** (줄바꿈으로 구분)
- 영상 ${effectiveDuration}초 길이에 딱 맞게 ${targetLines}개 자막으로 작성
- 구조 템플릿 (제품에 맞게 직접 작성):
  1. 후킹: "야 이거 진짜 미쳤어" 류
  2. 제품의 핵심 장점 1
  3. 제품의 핵심 장점 2  
  4. 사용 후기 또는 인상적 표현
  5. 가격/가성비 강조
  6. 구매 유도 CTA
- 한 줄은 보통 12~25자
- 짧은 임팩트 멘트를 연속으로
- 🚫 영상 길이를 초과하지 않도록 절대 ${targetChars}자를 넘기지 말 것

⚠️ 중요: 이건 **구조만** 참고! 문장은 **제품 정보에 맞게 직접** 작성!
❌ "흡입력/무선/청소" 같은 단어 무조건 쓰면 안 됨 (청소기 아니면)
✅ 제품 종류에 맞는 단어만 사용

**기타 요구사항:**
- ${speechInstruction}
- 마침표(.) 금지, 느낌표/물음표/"ㅋㅋ"/"ㅠㅠ" 등 생생한 표현 사용
- 말하듯이 자연스럽게, 쇼츠 트렌디한 말투
${hookText ? `- 🔴 **첫 문장 반드시**: "${hookText}"` : '- 첫 문장은 강한 후킹 멘트 ("야 이거 진짜", "이거 안 보면 손해", "미쳤다 진짜" 등)'}
${outroText ? `- 🔴 **마지막 문장 반드시**: "${outroText}"` : '- 마지막 문장은 구매 유도 CTA ("링크 눌러", "지금 가져가", "빨리 담아")'}

**구조 (자연스럽게 섞어서):**
1. 🎣 후킹 (2~3자막): 관심 끌기
2. 💔 공감/문제 (2~3자막): "이런 거 있잖아" 
3. ✨ 해결/제품 (3~4자막): 제품 소개
4. 🔥 장점/증명 (3~4자막): "진짜 좋음", "써봤는데" 
5. 🛒 CTA (2~3자막): 구매 유도

**출력 형식:**
- 줄바꿈으로 구분된 대본만 출력
- 한 줄 = 한 자막
- 코드블록, 설명, 번호, 이모지 없이 순수 대본만
- 🔴 **총 글자수 ${minChars}~${targetChars}자 엄수!** (이거 못 지키면 실패)`;

    // LLM 호출 (🆕 재시도 로직)
    const provider = savedConfig.groqApiKey ? 'groq' : 'openai';
    const endpoint = provider === 'groq' 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
    const key = provider === 'groq' ? savedConfig.groqApiKey : savedConfig.openaiApiKey;
    
    const axios = require('axios');
    
    // 🆕 대본 생성 함수 (재시도용)
    const callLLM = async (currentPrompt) => {
      const res = await axios.post(endpoint, {
        model,
        messages: [{ role: 'user', content: currentPrompt }],
        temperature: 0.7,
        max_tokens: 1500,  // 🆕 1000→1500으로 늘림 (더 긴 대본 허용)
      }, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      });
      let s = res.data.choices[0].message.content.trim();
      s = s.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
      return s;
    };
    
    let script = await callLLM(prompt);
    let scriptLen = script.replace(/\s/g, '').length;
    
    // 🆕 길이 검증 - 너무 짧으면 재시도 (한 번만)
    if (effectiveDuration && scriptLen < minChars * 0.8) {
      console.log(`[대본생성] ⚠️ 너무 짧음 (${scriptLen}자 < ${minChars}자). 재시도...`);
      
      const retryPrompt = prompt + `

**🚨 재생성 이유**: 방금 생성한 대본이 ${scriptLen}자로 너무 짧았음.
**이번엔 반드시 ${minChars}~${targetChars}자로!** 
더 풍성하게 써주세요. 공감/장점/사용 후기 부분을 더 늘려도 좋음.
짧은 자막을 여러 개 더 추가해서 영상 ${effectiveDuration}초를 가득 채워야 함.`;
      
      try {
        const retryScript = await callLLM(retryPrompt);
        const retryLen = retryScript.replace(/\s/g, '').length;
        // 재시도 결과가 더 길면 사용
        if (retryLen > scriptLen) {
          script = retryScript;
          scriptLen = retryLen;
          console.log(`[대본생성] ✅ 재시도 성공: ${retryLen}자`);
        }
      } catch (e) {
        console.warn('[대본생성] 재시도 실패, 기존 결과 사용:', e.message);
      }
    }
    
    const scriptLineCount = script.split('\n').filter(l => l.trim()).length;
    console.log(`[대본생성] ✅ 완료: ${scriptLen}자 (목표 ${minChars}~${targetChars}자), ${scriptLineCount}줄`);
    if (effectiveDuration) {
      const expectedDur = scriptLen / cps;
      console.log(`[대본생성] 예상 TTS 길이: ${expectedDur.toFixed(1)}초 (영상 ${effectiveDuration}초)`);
    }
    
    return { 
      success: true, 
      script,
      // 🆕 디버깅용 정보
      stats: {
        length: scriptLen,
        lines: scriptLineCount,
        target: { min: minChars, max: targetChars },
        duration: effectiveDuration,
      }
    };
  } catch (error) {
    console.error('제품 대본 생성 오류:', error);
    return { success: false, error: error.message };
  }
});

// ===== 🆕 인물 영상 대본 추출 + 번역 =====
ipcMain.handle('extract-and-translate-script', async (event, videoUrl, targetLang) => {
  try {
    const savedConfig = loadConfig();
    const apiKey = savedConfig.groqApiKey || savedConfig.openaiApiKey;
    if (!apiKey) {
      return { success: false, error: 'API 키가 설정되지 않았습니다.' };
    }
    
    if (!videoUrl || !videoUrl.trim()) {
      return { success: false, error: '영상 URL 또는 파일을 입력해주세요.' };
    }
    
    const workDir = getWorkDir();
    const jobId = 'talking-' + Date.now();
    const jobDir = path.join(workDir, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    
    // 진행 상황 전송
    const sendProgress = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('talking-script-progress', { message: msg });
      }
    };
    
    sendProgress('📥 영상 준비 중...');
    
    // 1. 영상 준비 (URL이면 다운로드, 로컬 파일이면 복사)
    const videoPath = path.join(jobDir, 'video.mp4');
    const isUrl = /^https?:\/\//i.test(videoUrl.trim());
    
    if (isUrl) {
      // URL이면 yt-dlp로 다운로드
      sendProgress('📥 영상 다운로드 중...');
      const ytdlp = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      
      try {
        await new Promise((resolve, reject) => {
          const { spawn } = require('child_process');
          const proc = spawn(ytdlp, [
            videoUrl.trim(),
            '-o', videoPath,
            '-f', 'best[ext=mp4]/best',
            '--no-playlist', '--quiet'
          ]);
          proc.on('close', code => {
            if (code === 0 && fs.existsSync(videoPath)) {
              resolve();
            } else {
              reject(new Error('다운로드 실패 (code: ' + code + ')'));
            }
          });
          proc.on('error', reject);
        });
      } catch (e) {
        return { success: false, error: '영상 다운로드 실패: ' + e.message };
      }
    } else {
      // 🆕 로컬 파일이면 복사만
      sendProgress('📁 파일 확인 중...');
      try {
        const localPath = videoUrl.trim();
        console.log(`[talking-script] 로컬 파일 경로: "${localPath}"`);
        
        if (!fs.existsSync(localPath)) {
          return { success: false, error: '파일을 찾을 수 없습니다: ' + localPath };
        }
        
        const ext = path.extname(localPath).toLowerCase();
        const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        
        if (imageExts.includes(ext)) {
          return { 
            success: false, 
            error: `📸 이미지 파일(${ext})은 인물 영상에서 사용할 수 없습니다!\n\n인물 영상은 영상 파일이 필요합니다.\n\n💡 이미지로 영상 만들기는 5월 출시 예정인 "썰툰 모드"에서 가능합니다.\n\n✅ mp4, mov 등 영상 파일을 업로드해주세요.` 
          };
        }
        
        if (!videoExts.includes(ext)) {
          return { success: false, error: `지원하지 않는 파일 형식입니다: ${ext}\n지원 형식: mp4, mov, avi, mkv, webm, flv, wmv, m4v` };
        }
        
        const stats = fs.statSync(localPath);
        if (stats.size === 0) {
          return { success: false, error: '파일이 비어있습니다 (0바이트)' };
        }
        console.log(`[talking-script] 파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        
        fs.copyFileSync(localPath, videoPath);
        
        if (!fs.existsSync(videoPath)) {
          return { success: false, error: '파일 복사 실패: 대상 파일이 생성되지 않았습니다' };
        }
        const copiedStats = fs.statSync(videoPath);
        if (copiedStats.size === 0) {
          return { success: false, error: '파일 복사 실패: 복사된 파일이 비어있습니다' };
        }
        console.log(`[talking-script] ✅ 로컬 파일 복사 완료 (${(copiedStats.size / 1024 / 1024).toFixed(2)}MB)`);
      } catch (e) {
        console.error('[talking-script] 파일 처리 실패:', e);
        return { success: false, error: '파일 읽기 실패: ' + e.message };
      }
    }
    
    // 🆕 최종 videoPath 검증
    if (!fs.existsSync(videoPath)) {
      return { success: false, error: '영상 파일 준비 실패: ' + videoPath };
    }
    
    sendProgress('🎤 음성 추출 중...');
    
    // 2. 오디오 추출
    const audioPath = path.join(jobDir, 'audio.mp3');
    let ffmpegPath = 'ffmpeg';
    try {
      ffmpegPath = require('ffmpeg-static');
    } catch (e) {
      console.log('ffmpeg-static 없음, 시스템 ffmpeg 사용');
    }
    
    // 🆕 ffmpeg 실행 파일 존재 확인
    if (ffmpegPath && ffmpegPath !== 'ffmpeg' && !fs.existsSync(ffmpegPath)) {
      console.warn(`[talking-script] ffmpeg-static 경로 존재하지 않음: ${ffmpegPath}, 시스템 ffmpeg로 폴백`);
      ffmpegPath = 'ffmpeg';
    }
    
    console.log(`[talking-script] ffmpeg 경로: ${ffmpegPath}`);
    console.log(`[talking-script] 입력 영상: ${videoPath}`);
    console.log(`[talking-script] 출력 오디오: ${audioPath}`);
    
    try {
      await new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        let stderrOutput = '';
        
        const proc = spawn(ffmpegPath, [
          '-i', videoPath,
          '-vn', '-acodec', 'libmp3lame', '-ar', '44100', '-ac', '1', '-b:a', '192k',
          '-y', audioPath
        ]);
        
        proc.stderr.on('data', (data) => {
          stderrOutput += data.toString();
        });
        
        proc.on('close', code => {
          if (code === 0 && fs.existsSync(audioPath)) {
            const audioSize = fs.statSync(audioPath).size;
            console.log(`[talking-script] ✅ 오디오 추출 완료: ${(audioSize / 1024 / 1024).toFixed(2)}MB`);
            resolve();
          } else {
            console.error(`[talking-script] ❌ ffmpeg 실패 (code: ${code})`);
            console.error(`[talking-script] stderr 마지막 800자:\n${stderrOutput.slice(-800)}`);
            
            let errorMsg = `오디오 추출 실패 (code: ${code})`;
            if (stderrOutput.includes('No such file')) {
              errorMsg = '영상 파일을 찾을 수 없습니다';
            } else if (stderrOutput.includes('Invalid data')) {
              errorMsg = '영상 파일이 손상되었거나 지원하지 않는 형식입니다';
            } else if (stderrOutput.includes('Permission denied')) {
              errorMsg = '파일 접근 권한이 없습니다';
            } else if (stderrOutput.includes('does not contain any stream')) {
              errorMsg = '영상에 오디오 트랙이 없습니다';
            } else if (stderrOutput.includes('moov atom not found')) {
              errorMsg = '영상 파일이 손상되었습니다 (moov atom)';
            }
            
            reject(new Error(errorMsg));
          }
        });
        
        proc.on('error', (err) => {
          console.error(`[talking-script] ffmpeg 실행 에러:`, err);
          if (err.code === 'ENOENT') {
            reject(new Error('ffmpeg를 찾을 수 없습니다. 프로그램 재설치가 필요할 수 있습니다.'));
          } else {
            reject(err);
          }
        });
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
    
    sendProgress('🧠 음성 인식 중 (Whisper)...');
    
    // 3. Whisper로 음성 인식
    const { transcribeAudio } = require('./processor');
    let transcript = '';
    let whisperSegments = [];
    try {
      const groqKey = savedConfig.groqApiKey;
      if (!groqKey) {
        throw new Error('Groq API 키가 필요합니다');
      }
      const result = await transcribeAudio(audioPath, 'auto', groqKey, (stage, pct, msg) => {
        sendProgress(msg);
      });
      transcript = result.text || '';
      whisperSegments = result.segments || [];
      console.log(`[인물대본] Whisper 결과: ${transcript.length}자, ${whisperSegments.length}세그먼트`);
      if (whisperSegments.length > 0) {
        const lastSeg = whisperSegments[whisperSegments.length - 1];
        console.log(`[인물대본] 마지막 세그먼트 끝: ${lastSeg.end?.toFixed(2)}초`);
      }
    } catch (e) {
      console.warn('Whisper 실패:', e.message);
      return { success: false, error: '음성 인식 실패: ' + e.message };
    }
    
    if (!transcript.trim() || transcript.trim() === '.' || transcript.replace(/[.\s]/g, '').length === 0) {
      return { success: false, error: '영상에서 음성을 인식하지 못했습니다. 음성이 있는 영상인지 확인해주세요.' };
    }
    
    // 🔴 원본 언어 그대로 반환 (번역 없음!)
    // 더 정확한 음성 인식을 위해 원본 언어로 추출
    // 사용자가 GPT로 직접 번역하면 더 자연스러운 결과
    
    sendProgress('✅ 대본 추출 완료!');
    
    // 🔴 핵심: 세그먼트별로 줄바꿈! (타이밍 매칭을 위해)
    // 🆕 각 라인이 어느 원본 Whisper 세그먼트에서 나왔는지 매핑 정보 유지!
    let cleanScript;
    let finalSegmentCount = 0;
    const lineToSegmentMap = []; // [라인 인덱스] = 원본 세그먼트 인덱스
    
    // 🆕 언어별 적절한 한 줄 최대 글자수 (자막 가독성 기준)
    const MAX_CHARS_BY_LANG = {
      ko: 25, ja: 25, zh: 22, th: 28,
      en: 45, es: 45, fr: 45, de: 45, it: 45, pt: 45,
      ru: 38, vi: 38,
    };
    const MAX_CHARS = MAX_CHARS_BY_LANG[targetLang] || 30;
    
    if (whisperSegments && whisperSegments.length > 0) {
      const lines = [];
      
      whisperSegments.forEach((seg, segIdx) => {
        const text = (seg.text || '').trim();
        if (!text || text === '.') return;
        
        if (text.length <= MAX_CHARS) {
          // 짧으면 그대로
          lines.push(text);
          lineToSegmentMap.push(segIdx);
        } else {
          // 길면 쪼개기 (여러 단계 시도)
          let parts = [];
          
          // 1) 문장 부호 기준
          const byPunct = text.split(/(?<=[.!?。！？,，、])\s+/).map(p => p.trim()).filter(Boolean);
          if (byPunct.length > 1) {
            parts = byPunct;
          } else {
            // 2) 접속사/연결어 기준
            parts = [text];
          }
          
          // 3) 여전히 MAX_CHARS 넘으면 공백 단위로 강제 분할
          const finalParts = [];
          for (const p of parts) {
            if (p.length <= MAX_CHARS) {
              finalParts.push(p);
            } else {
              const words = p.split(/\s+/);
              let current = '';
              for (const w of words) {
                if ((current + ' ' + w).trim().length > MAX_CHARS && current) {
                  finalParts.push(current.trim());
                  current = w;
                } else {
                  current = current ? current + ' ' + w : w;
                }
              }
              if (current.trim()) finalParts.push(current.trim());
            }
          }
          
          // 각 쪼개진 조각은 모두 같은 원본 세그먼트에서 나온 것으로 표시
          finalParts.forEach(p => {
            if (p.trim()) {
              lines.push(p.trim());
              lineToSegmentMap.push(segIdx);
            }
          });
        }
      });
      
      cleanScript = lines.join('\n');
      finalSegmentCount = lines.length;
    } else {
      // 폴백: 마침표 기준
      cleanScript = transcript
        .replace(/\.{2,}/g, '')
        .replace(/\.\s*/g, '\n')
        .replace(/\.$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      finalSegmentCount = cleanScript.split('\n').filter(l => l.trim()).length;
    }
    
    // 빈 줄 제거
    const filteredLines = cleanScript.split('\n').filter(l => l.trim());
    cleanScript = filteredLines.join('\n');
    finalSegmentCount = filteredLines.length;
    
    // 마침표만 있거나 빈 결과 처리
    if (!cleanScript || cleanScript.replace(/[.\s]/g, '').length === 0) {
      return { success: false, error: '영상에서 음성을 인식하지 못했습니다. 음성이 있는 영상인지 확인해주세요.' };
    }
    
    // 🆕 최종 로그 (명확하게!)
    console.log(`[인물대본] ========================================`);
    console.log(`[인물대본] ✅ 대본 추출 완료`);
    console.log(`[인물대본] Whisper 세그먼트: ${whisperSegments.length}개`);
    console.log(`[인물대본] 최종 대본 줄 수: ${finalSegmentCount}줄`);
    console.log(`[인물대본] 라인→세그먼트 매핑: ${lineToSegmentMap.length}개`);
    console.log(`[인물대본] 첫 3줄 미리보기:`);
    filteredLines.slice(0, 3).forEach((line, i) => {
      const segIdx = lineToSegmentMap[i];
      const seg = whisperSegments[segIdx];
      console.log(`  ${i+1}. "${line.substring(0, 40)}..." (원본 세그 #${segIdx}, ${seg?.start?.toFixed(2)}s~${seg?.end?.toFixed(2)}s)`);
    });
    console.log(`[인물대본] ========================================`);
    
    // 🆕 완료 진행 메시지 확실하게 한 번 더
    sendProgress(`✅ 대본 추출 완료! (${finalSegmentCount}줄)`);
    
    // 임시 폴더 정리
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch (e) {}
    
    // 🆕 Whisper 세그먼트 + 라인-세그먼트 매핑 정보도 함께 반환!
    // → renderer가 확정할 때 이 정보를 config에 실어서 processor에 전달
    return { 
      success: true, 
      script: cleanScript, 
      originalTranscript: transcript,
      segmentCount: finalSegmentCount,  // 쪼갠 후 최종 줄 수
      whisperSegments: whisperSegments.map(s => ({  // 타이밍 정보
        start: s.start,
        end: s.end,
        text: (s.text || '').trim(),
      })),
      lineToSegmentMap,  // 각 라인이 어느 원본 세그먼트에서 나왔는지
    };
    
  } catch (error) {
    console.error('인물 대본 추출 오류:', error);
    return { success: false, error: error.message };
  }
});

// ===== 🆕 썰툰 대본 생성 =====
ipcMain.handle('generate-ssultoon-script', async (event, topic, speechStyle, storyType, lang) => {
  try {
    const savedConfig = loadConfig();
    savedConfig.ssultoonLang = lang || 'ko';
    const script = await generateScript(topic, savedConfig, speechStyle || 'casual', storyType || 'funny');
    return { success: true, script };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== 🆕 썰툰 제목 생성 =====
ipcMain.handle('generate-ssultoon-title', async (event, topic) => {
  try {
    const savedConfig = loadConfig();
    const apiKey = savedConfig.groqApiKey || savedConfig.openaiApiKey;
    if (!apiKey) {
      return { success: false, error: 'API 키 필요' };
    }
    
    const isGroq = !!savedConfig.groqApiKey;
    const endpoint = isGroq 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
    
    const axios = require('axios');
    const response = await axios.post(endpoint, {
      model,
      messages: [{
        role: 'user',
        content: `주제: "${topic}"

이 주제로 쇼츠 썰 제목 3개 만들어줘.
- 자극적이고 클릭하고 싶게
- 짧게 (15자 이내)
- 궁금증 유발

JSON으로만 출력:
["제목1", "제목2", "제목3"]`
      }],
      temperature: 0.9,
      max_tokens: 200,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const titles = JSON.parse(jsonMatch[0]);
      return { success: true, titles };
    }
    return { success: false, error: '파싱 실패' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== 🆕 말투 변환 =====
ipcMain.handle('convert-speech-style', async (event, pages, targetStyle) => {
  try {
    const savedConfig = loadConfig();
    const newPages = await convertSpeechStyle(pages, targetStyle, savedConfig);
    return { success: true, pages: newPages };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== 🆕 썰툰 이미지 생성 =====
ipcMain.handle('generate-ssultoon-image', async (event, prompt, referenceImages) => {
  try {
    const outputDir = path.join(app.getPath('temp'), 'ssultoon-images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 참고 이미지가 있으면 프롬프트에 스타일 힌트 추가
    let finalPrompt = prompt;
    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
      const labels = referenceImages.map(r => r.label).join(', ');
      finalPrompt = `${prompt}, consistent style with reference characters (${labels}), same art style`;
    }
    
    const outputPath = path.join(outputDir, `img_${Date.now()}.png`);
    const imagePath = await generateImagePollinations(finalPrompt, outputPath);
    
    return { success: true, imagePath, imageUrl: `file://${imagePath}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== 🆕 프롬프트 번역 (한글 → 영어) =====
ipcMain.handle('translate-prompt', async (event, prompt) => {
  try {
    const config = loadConfig();
    
    // Groq 또는 OpenAI 사용
    let translated = prompt;
    
    if (config.groqApiKey) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{
            role: 'user',
            content: `Translate this Korean image prompt to English. Output ONLY the English translation, nothing else.

Korean: ${prompt}

English:`
          }],
          max_tokens: 200,
          temperature: 0.3
        })
      });
      
      const data = await response.json();
      translated = data.choices?.[0]?.message?.content?.trim() || prompt;
    } else if (config.openaiApiKey) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: `Translate this Korean image prompt to English. Output ONLY the English translation, nothing else.

Korean: ${prompt}

English:`
          }],
          max_tokens: 200,
          temperature: 0.3
        })
      });
      
      const data = await response.json();
      translated = data.choices?.[0]?.message?.content?.trim() || prompt;
    }
    
    return { success: true, translated };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== 🆕 제목 자동생성 =====
ipcMain.handle('generate-title', async (event, script, category) => {
  try {
    const config = loadConfig();
    
    let categoryHint = '';
    if (category === 'reaction') categoryHint = '썰툰/브이로그 스타일';
    else if (category === 'product') categoryHint = '쇼핑/광고 스타일';
    else categoryHint = '인물/리액션 스타일';
    
    const prompt = `다음 대본을 보고 유튜브 쇼츠/틱톡에 어울리는 제목을 생성해줘.

대본:
${script.substring(0, 500)}

요구사항:
- ${categoryHint}
- 10~20자 이내
- 호기심 유발
- [[]] 로 핵심 키워드 1개 강조 (예: 이거 [[꿀템]]임)
- 3개 후보 중 랜덤 1개만 출력
- 제목만 출력, 설명 금지

제목:`;

    let title = '';
    
    if (config.groqApiKey) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          temperature: 0.9
        })
      });
      
      const data = await response.json();
      title = data.choices?.[0]?.message?.content?.trim() || '';
    } else if (config.openaiApiKey) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          temperature: 0.9
        })
      });
      
      const data = await response.json();
      title = data.choices?.[0]?.message?.content?.trim() || '';
    } else {
      return { success: false, error: 'API 키가 없습니다' };
    }
    
    // 불필요한 따옴표/기호 제거
    title = title.replace(/^["']|["']$/g, '').replace(/^제목:\s*/i, '').trim();
    
    return { success: true, title };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== 🆕 랜덤 주제 추천 =====
ipcMain.handle('get-random-topics', () => {
  return getRandomTopics();
});
