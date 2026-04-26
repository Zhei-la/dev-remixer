// ===== 빌드 모드 + 사용자 등급 관리 =====
// 빌드 모드: trial(체험판) / full(정식판)
// 사용자 등급: trial / basic / pro / admin (서버에서 받음)

const path = require('path');

function detectBuildMode() {
  if (process.env.BUILD_MODE === 'trial') return 'trial';
  if (process.env.BUILD_MODE === 'full') return 'full';

  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = require(pkgPath);
    if (pkg.buildMode === 'trial') return 'trial';
    if (pkg.buildMode === 'full') return 'full';
  } catch (e) {}

  return 'full';
}

const BUILD_MODE = detectBuildMode();
const IS_TRIAL = BUILD_MODE === 'trial';
const IS_FULL = BUILD_MODE === 'full';

// ===== 등급별 제한 설정 =====

// 🎁 체험판 (무료)
const TRIAL_LIMITS = {
  tier: 'trial',
  tierName: '체험판',
  totalVideoLimit: 10,
  dailyVideoLimit: 10,
  isLifetimeLimit: true,
  forceWatermark: false,
  lockedFeatures: {
    autoUpload: false,
    advancedVoices: true,
    drama: true,
    longform: true,
    reaction: true,
  },
  voiceLimit: 10,
  allowedTargetLangs: ['ko', 'en'],
  watermarkSuffix: '',
  upgradeUrl: 'https://shortsremixer.app/upgrade',
  monthlyPriceKRW: 0,
};

// ⭐ 베이직 (월 14,900원) - 모든 모드 사용 가능, 주제당 6개씩 일 18개
const BASIC_LIMITS = {
  tier: 'basic',
  tierName: '베이직',
  totalVideoLimit: 9999,
  dailyVideoLimit: 18,           // 🔴 일 18개 (주제당 6개 × 3주제)
  perTypeDailyLimit: 6,          // 🔴 주제별 일일 한도
  isLifetimeLimit: false,
  forceWatermark: false,
  lockedFeatures: {
    autoUpload: false,
    advancedVoices: false,
    drama: false,                 // ✅ 모든 모드 풀림
    longform: false,              // ✅ 롱폼도 풀림 (5월 오픈 시)
    reaction: false,              // ✅ 예능 썰 풀림
  },
  voiceLimit: 0,
  allowedTargetLangs: false,
  watermarkSuffix: '',
  upgradeUrl: 'https://shortsremixer.app/upgrade-pro',
  monthlyPriceKRW: 14900,
};

// 💎 프로 (월 29,900원) - 모든 모드 + 주제당 15개씩 일 45개
const PRO_LIMITS = {
  tier: 'pro',
  tierName: '프로',
  totalVideoLimit: 9999,
  dailyVideoLimit: 45,           // 🔴 일 45개 (주제당 15개 × 3주제)
  perTypeDailyLimit: 15,         // 🔴 주제별 일일 한도
  isLifetimeLimit: false,
  forceWatermark: false,
  lockedFeatures: {
    autoUpload: false,
    advancedVoices: false,
    drama: false,
    longform: false,
    reaction: false,
  },
  voiceLimit: 0,
  allowedTargetLangs: false,
  watermarkSuffix: '',
  upgradeUrl: '',
  monthlyPriceKRW: 29900,
};

// 👑 관리자
const ADMIN_LIMITS = {
  tier: 'admin',
  tierName: '관리자',
  totalVideoLimit: 99999,
  dailyVideoLimit: 9999,
  perTypeDailyLimit: 9999,
  isLifetimeLimit: false,
  forceWatermark: false,
  lockedFeatures: {
    autoUpload: false,
    advancedVoices: false,
    drama: false,
    longform: false,
    reaction: false,
  },
  voiceLimit: 0,
  allowedTargetLangs: false,
  watermarkSuffix: '',
  upgradeUrl: '',
  monthlyPriceKRW: 0,
};

const LIMITS_BY_TIER = {
  trial: TRIAL_LIMITS,
  basic: BASIC_LIMITS,
  pro: PRO_LIMITS,
  admin: ADMIN_LIMITS,
};

const DEFAULT_LIMITS = TRIAL_LIMITS;

function getLimitsForUser(userTier) {
  if (IS_TRIAL) return TRIAL_LIMITS;
  return LIMITS_BY_TIER[userTier] || TRIAL_LIMITS;
}

function getAppDisplayName(userTier) {
  if (IS_TRIAL) return 'Shorts Remixer 체험판';
  if (userTier === 'admin') return 'Shorts Remixer · 관리자';
  if (userTier === 'pro') return 'Shorts Remixer · Pro';
  if (userTier === 'basic') return 'Shorts Remixer · Basic';
  return 'Shorts Remixer';
}

module.exports = {
  BUILD_MODE,
  IS_TRIAL,
  IS_FULL,
  LIMITS: DEFAULT_LIMITS,
  TRIAL_LIMITS,
  BASIC_LIMITS,
  PRO_LIMITS,
  ADMIN_LIMITS,
  LIMITS_BY_TIER,
  getLimitsForUser,
  getAppDisplayName,
  APP_DISPLAY_NAME: getAppDisplayName(IS_TRIAL ? 'trial' : 'unknown'),
};
