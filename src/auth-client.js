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
    const result = await this.apiCall('/api/app/check');
    // 🆕 서버 응답에서 최신 user 정보 받으면 this.user 갱신 (병합)
    if (result.ok && result.data) {
      console.log('[auth-client] 📥 서버 응답:', JSON.stringify(result.data));
      
      // 🔴 서버 응답 형식: { user: {...}, usage: { count, limit, remaining, unlimited, expiresAt } }
      // user 객체와 usage 객체에서 정보 합쳐서 this.user 갱신
      const userPart = result.data.user || {};
      const usagePart = result.data.usage || {};
      
      // usage 객체의 count/limit을 user의 usage_count/usage_limit로 매핑
      const merged = {
        ...this.user,           // 기존 정보 유지
        ...userPart,            // 서버의 새 user 정보로 덮어쓰기
      };
      
      // 사용량 매핑 (서버는 usage.count, 클라이언트는 usage_count로 사용)
      if (usagePart.count !== undefined) merged.usage_count = usagePart.count;
      if (usagePart.limit !== undefined) merged.usage_limit = usagePart.limit;
      if (usagePart.remaining !== undefined) merged.usage_remaining = usagePart.remaining;
      if (usagePart.unlimited !== undefined) merged.unlimited = usagePart.unlimited;
      if (usagePart.expiresAt !== undefined) merged.expires_at = usagePart.expiresAt;
      
      this.user = merged;
      this.saveAuth();
      console.log('[auth-client] ✅ user 갱신:', this.user.username, 'usage:', this.user.usage_count, '/', this.user.usage_limit);
    }
    return result;
  }

  // ===== 작업 시작 전 검증 (매번 호출) =====
  async verifyJob(jobType = 'video') {
    if (!this.accessToken) {
      return { ok: false, error: '로그인이 필요합니다' };
    }
    const result = await this.apiCall('/api/app/verify-job', {
      method: 'POST',
      data: {
        jobType,
        deviceFingerprint: this.deviceFingerprint,
      },
    });
    // 🆕 서버가 user + usage 정보 보내면 갱신
    if (result.ok && result.data) {
      console.log('[auth-client] 📥 verifyJob 응답:', JSON.stringify(result.data));
      const userPart = result.data.user || {};
      const usagePart = result.data.usage || {};
      const merged = { ...this.user, ...userPart };
      if (usagePart.count !== undefined) merged.usage_count = usagePart.count;
      if (usagePart.limit !== undefined) merged.usage_limit = usagePart.limit;
      if (usagePart.remaining !== undefined) merged.usage_remaining = usagePart.remaining;
      if (usagePart.unlimited !== undefined) merged.unlimited = usagePart.unlimited;
      this.user = merged;
      this.saveAuth();
      console.log('[auth-client] ✅ verifyJob user 갱신:', this.user.username, 'usage:', this.user.usage_count, '/', this.user.usage_limit);
    }
    return result;
  }

  // ===== 작업 실패 시 횟수 환불 =====
  // 실패 / 취소 시 차감된 횟수를 다시 돌려받음
  async refundJob(jobType = 'video', reason = 'failed') {
    if (!this.accessToken) {
      return { ok: false };
    }
    try {
      const result = await this.apiCall('/api/app/refund-job', {
        method: 'POST',
        data: {
          jobType,
          reason,
          deviceFingerprint: this.deviceFingerprint,
        },
      });
      // 🆕 서버가 환불 후 newCount 보내면 갱신
      if (result.ok && result.data) {
        if (result.data.newCount !== undefined) {
          this.user = { ...this.user, usage_count: result.data.newCount };
          this.saveAuth();
        }
      }
      return result;
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
