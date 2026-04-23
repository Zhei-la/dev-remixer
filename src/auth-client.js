// src/auth-client.js - 인증 서버와 통신하는 클라이언트 모듈
const axios = require('axios');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

class AuthClient {
  constructor(configPath) {
    this.configPath = configPath;
    this.serverUrl = 'https://shorts-remixer-zhei-lashorts-remixer.up.railway.app';
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.deviceFingerprint = this.generateDeviceFingerprint();
    this.loadAuth();
  }

  // ===== 디바이스 핑거프린트 (PC 고유 식별자) =====
  generateDeviceFingerprint() {
    const data = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model || '',
      os.totalmem().toString(),
      os.userInfo().username,
    ].join('|');
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  // ===== 인증 정보 영구 저장 =====
  loadAuth() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        // 저장된 URL이 있으면 사용, 없으면 기본값 유지
        if (data.serverUrl) this.serverUrl = data.serverUrl;
        this.accessToken = data.accessToken || null;
        this.refreshToken = data.refreshToken || null;
        this.user = data.user || null;
      }
    } catch (e) {
      console.error('Failed to load auth:', e);
    }
  }

  saveAuth() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify({
        serverUrl: this.serverUrl,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        user: this.user,
      }, null, 2));
    } catch (e) {
      console.error('Failed to save auth:', e);
    }
  }

  clearAuth() {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.saveAuth();
  }

  setServerUrl(url) {
    // 끝의 / 제거
    this.serverUrl = url.replace(/\/$/, '');
    this.saveAuth();
  }

  // ===== API 호출 헬퍼 =====
  async apiCall(endpoint, options = {}) {
    if (!this.serverUrl) {
      throw new Error('서버 URL이 설정되지 않았습니다');
    }
    const url = this.serverUrl + endpoint;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      ...(options.headers || {}),
    };

    try {
      const response = await axios({
        url,
        method: options.method || 'GET',
        headers,
        data: options.data,
        timeout: 15000,
      });
      return { ok: true, data: response.data };
    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data || {};

      // 토큰 만료 → 자동 갱신 시도
      if (status === 401 && this.refreshToken && !options._retried) {
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          return this.apiCall(endpoint, { ...options, _retried: true });
        }
      }

      return {
        ok: false,
        status,
        error: errorData.error || error.message || '서버 연결 실패',
        code: errorData.code,
      };
    }
  }

  async tryRefresh() {
    try {
      const response = await axios.post(this.serverUrl + '/api/auth/refresh', {
        refreshToken: this.refreshToken,
      });
      this.accessToken = response.data.accessToken;
      this.saveAuth();
      return true;
    } catch (e) {
      this.clearAuth();
      return false;
    }
  }

  // ===== 회원가입 =====
  async register(username, email, password, inviteCode) {
    return this.apiCall('/api/auth/register', {
      method: 'POST',
      data: { username, email, password, inviteCode },
    });
  }

  // ===== 로그인 =====
  async login(username, password) {
    const result = await this.apiCall('/api/auth/login', {
      method: 'POST',
      data: {
        username,
        password,
        deviceFingerprint: this.deviceFingerprint,
      },
    });

    if (result.ok && result.data.success) {
      this.accessToken = result.data.accessToken;
      this.refreshToken = result.data.refreshToken;
      this.user = result.data.user;
      this.saveAuth();
    }
    return result;
  }

  // ===== 로그아웃 =====
  logout() {
    this.clearAuth();
  }

  // ===== 자가 점검 (앱 시작 시) =====
  async checkAuth() {
    if (!this.accessToken) return { ok: false, error: 'no token' };
    return this.apiCall('/api/app/check');
  }

  // ===== 작업 시작 전 검증 (매번 호출) =====
  async verifyJob(jobType = 'video') {
    if (!this.accessToken) {
      return { ok: false, error: '로그인이 필요합니다' };
    }
    return this.apiCall('/api/app/verify-job', {
      method: 'POST',
      data: {
        jobType,
        deviceFingerprint: this.deviceFingerprint,
      },
    });
  }

  // ===== 작업 실패 시 횟수 환불 =====
  // 실패 / 취소 시 차감된 횟수를 다시 돌려받음
  async refundJob(jobType = 'video', reason = 'failed') {
    if (!this.accessToken) {
      return { ok: false };
    }
    try {
      return await this.apiCall('/api/app/refund-job', {
        method: 'POST',
        data: {
          jobType,
          reason,
          deviceFingerprint: this.deviceFingerprint,
        },
      });
    } catch (e) {
      // 서버에 환불 엔드포인트 없어도 실패해선 안 됨
      console.warn('[refund] 환불 실패 (서버 미지원 가능):', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ===== 체험판 계정 생성 =====
  async createTrial() {
    return this.apiCall('/api/auth/trial', {
      method: 'POST',
      data: {
        deviceFingerprint: this.deviceFingerprint,
      },
    });
  }

  isLoggedIn() {
    return !!this.accessToken && !!this.user;
  }

  getUser() {
    return this.user;
  }
}

module.exports = AuthClient;
