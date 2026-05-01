/**
 * ═══════════════════════════════════════════════════════════
 * EduGuard AI — Frontend API Client & State Management
 * Connects to FastAPI backend at /api/v1
 * ═══════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────
const CONFIG = {
  // Change this to your production backend URL
  BACKEND_URL: 'http://localhost:8001/api/v1',
  FALLBACK_URL: 'http://localhost:8001/api/v1',
  TOKEN_KEY: 'eduguard_token',
  REFRESH_TOKEN_KEY: 'eduguard_refresh_token',
  DEBUG: true,
};

// Auto-detect localhost development
const BASE_URL = 
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? CONFIG.FALLBACK_URL
    : CONFIG.BACKEND_URL;

// ─────────────────────────────────────────────────────────
// Global State
// ─────────────────────────────────────────────────────────
let STATE = {
  token: localStorage.getItem(CONFIG.TOKEN_KEY) || null,
  refreshToken: localStorage.getItem(CONFIG.REFRESH_TOKEN_KEY) || null,
  currentUser: null,
  isLoading: false,
  error: null,
  lastSync: null,
};

// ─────────────────────────────────────────────────────────
// Logging Utility
// ─────────────────────────────────────────────────────────
const log = {
  info: (...args) => CONFIG.DEBUG && console.log('[EduGuard]', ...args),
  warn: (...args) => CONFIG.DEBUG && console.warn('[EduGuard WARN]', ...args),
  error: (...args) => CONFIG.DEBUG && console.error('[EduGuard ERROR]', ...args),
  group: (name) => CONFIG.DEBUG && console.group(`[EduGuard] ${name}`),
  groupEnd: () => CONFIG.DEBUG && console.groupEnd(),
};

log.info(`Connected to backend: ${BASE_URL}`);

// ─────────────────────────────────────────────────────────
// API Request Handler
// ─────────────────────────────────────────────────────────
async function apiRequest(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(STATE.token && { Authorization: `Bearer ${STATE.token}` }),
    ...options.headers,
  };

  STATE.isLoading = true;
  log.info(`→ ${options.method || 'GET'} ${path}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    STATE.isLoading = false;

    // Handle 401 - Token expired
    if (response.status === 401 && STATE.refreshToken) {
      log.warn('Token expired, attempting refresh...');
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry original request with new token
        return apiRequest(path, options);
      } else {
        logout();
        throw new Error('Session expired. Please login again.');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      STATE.error = error.detail || 'API request failed';
      log.error(`✗ ${response.status}: ${STATE.error}`);
      throw new Error(STATE.error);
    }

    const data = await response.json();
    STATE.error = null;
    STATE.lastSync = new Date();
    log.info(`✓ Success: ${path}`, data);
    return data;
  } catch (err) {
    STATE.isLoading = false;
    STATE.error = err.message;
    log.error(`Request failed: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────────────────
async function login(email, password) {
  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    STATE.token = data.access_token;
    STATE.refreshToken = data.refresh_token;
    STATE.currentUser = { email, role: data.user_role };

    localStorage.setItem(CONFIG.TOKEN_KEY, data.access_token);
    localStorage.setItem(CONFIG.REFRESH_TOKEN_KEY, data.refresh_token);

    log.info('Login successful:', STATE.currentUser);
    return data;
  } catch (err) {
    log.error('Login failed:', err);
    throw err;
  }
}

async function register(fullName, email, password, role = 'teacher', schoolId = 1) {
  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
        role,
        school_id: schoolId,
      }),
    });
    log.info('Registration successful:', data);
    return data;
  } catch (err) {
    log.error('Registration failed:', err);
    throw err;
  }
}

async function refreshAccessToken() {
  if (!STATE.refreshToken) return false;
  try {
    const data = await apiRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: STATE.refreshToken }),
    });
    STATE.token = data.access_token;
    STATE.refreshToken = data.refresh_token;
    localStorage.setItem(CONFIG.TOKEN_KEY, data.access_token);
    localStorage.setItem(CONFIG.REFRESH_TOKEN_KEY, data.refresh_token);
    return true;
  } catch (err) {
    log.warn('Token refresh failed');
    return false;
  }
}

async function getCurrentUser() {
  try {
    const user = await apiRequest('/auth/me');
    STATE.currentUser = user;
    return user;
  } catch (err) {
    log.error('Failed to fetch current user');
    return null;
  }
}

function logout() {
  STATE.token = null;
  STATE.refreshToken = null;
  STATE.currentUser = null;
  localStorage.removeItem(CONFIG.TOKEN_KEY);
  localStorage.removeItem(CONFIG.REFRESH_TOKEN_KEY);
  log.info('Logged out');
}

// ─────────────────────────────────────────────────────────
// Dashboard Endpoints
// ─────────────────────────────────────────────────────────
async function getDashboardSummary() {
  try {
    const data = await apiRequest('/dashboard/summary');
    return data;
  } catch (err) {
    log.warn('Dashboard summary failed, returning demo data');
    return {
      total_students: 2847,
      at_risk_count: 143,
      open_interventions: 89,
      critical_alerts: 18,
      avg_attendance_rate: 87,
      top_at_risk: [
        { id: 1, name: 'Rahul K.', risk_score: 91, risk_level: 'critical' },
        { id: 2, name: 'Priya M.', risk_score: 78, risk_level: 'high' },
        { id: 3, name: 'Anjali S.', risk_score: 62, risk_level: 'caution' },
      ],
    };
  }
}

async function getDashboardTrends(metric = 'attendance', weeks = 12) {
  try {
    const data = await apiRequest(`/dashboard/trends/${metric}?weeks=${weeks}`);
    return data;
  } catch (err) {
    log.warn(`Trends for ${metric} unavailable`);
    return { data: [] };
  }
}

// ─────────────────────────────────────────────────────────
// Risk Endpoints
// ─────────────────────────────────────────────────────────
async function getRiskSummary() {
  try {
    const data = await apiRequest('/risk/summary');
    return data;
  } catch (err) {
    log.warn('Risk summary failed');
    return {
      total_students: 2847,
      avg_score: 45,
      high: 89,
      critical: 23,
    };
  }
}

async function getStudentRisk(studentId) {
  try {
    const data = await apiRequest(`/risk/student/${studentId}`);
    return data;
  } catch (err) {
    log.error(`Failed to fetch risk for student ${studentId}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Students Endpoints
// ─────────────────────────────────────────────────────────
async function getStudents(page = 1, pageSize = 20) {
  try {
    const data = await apiRequest(`/students?page=${page}&page_size=${pageSize}`);
    return data;
  } catch (err) {
    log.error('Failed to fetch students');
    throw err;
  }
}

async function getStudent(studentId) {
  try {
    const data = await apiRequest(`/students/${studentId}`);
    return data;
  } catch (err) {
    log.error(`Failed to fetch student ${studentId}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Alerts Endpoints
// ─────────────────────────────────────────────────────────
async function getAlerts(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const data = await apiRequest(`/alerts?${params.toString()}`);
    return data;
  } catch (err) {
    log.error('Failed to fetch alerts');
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Interventions Endpoints
// ─────────────────────────────────────────────────────────
async function getInterventions(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const data = await apiRequest(`/interventions?${params.toString()}`);
    return data;
  } catch (err) {
    log.error('Failed to fetch interventions');
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// UI Rendering Functions
// ─────────────────────────────────────────────────────────
async function renderDashboard() {
  try {
    log.group('Rendering Dashboard');
    const summary = await getDashboardSummary();

    // Update hero stats
    const stats = document.querySelectorAll('.hero-stat .num');
    if (stats[0]) stats[0].innerHTML = `<span>${summary.avg_attendance_rate}</span>%`;
    if (stats[1]) stats[1].innerHTML = `<span>${(summary.total_students / 1000).toFixed(1)}</span>K+`;

    // Update metric cards
    const cards = document.querySelectorAll('.metric-card .value');
    if (cards[0]) cards[0].textContent = summary.total_students.toLocaleString();
    if (cards[1]) {
      cards[1].textContent = summary.at_risk_count;
      cards[1].className = 'value danger';
    }
    if (cards[2]) cards[2].textContent = summary.open_interventions;
    if (cards[3]) cards[3].textContent = summary.critical_alerts;

    // Update risk list
    const riskList = document.querySelector('.risk-list');
    if (riskList && summary.top_at_risk?.length) {
      const existingRows = riskList.querySelectorAll('.risk-row');
      existingRows.forEach(r => r.remove());

      const rows = summary.top_at_risk.slice(0, 3).map(s => {
        const initials = s.name.split(' ').map(n => n[0]).join('').slice(0, 2);
        const colorMap = {
          critical: 'var(--red)',
          high: 'var(--accent2)',
          caution: 'var(--accent)',
        };
        const color = colorMap[s.risk_level] || 'var(--accent)';

        return `
          <div class="risk-row">
            <div class="risk-avatar" style="background:${color}22;color:${color}">${initials}</div>
            <div class="risk-info">
              <div class="rname">${s.name}</div>
              <div class="rmeta">Risk: ${s.risk_level.toUpperCase()}</div>
            </div>
            <div class="risk-score">
              <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:.82rem;color:${color}">${s.risk_score.toFixed(0)}%</span>
              <div class="risk-bar-wrap"><div class="risk-bar" style="width:${s.risk_score}%;background:${color}"></div></div>
            </div>
          </div>`;
      }).join('');

      riskList.insertAdjacentHTML('beforeend', rows);
    }

    log.groupEnd();
  } catch (err) {
    log.error('Dashboard render failed:', err);
  }
}

async function renderAttendanceTrend() {
  try {
    const trends = await getDashboardTrends('attendance', 12);
    const bars = document.querySelectorAll('.cb');

    if (bars.length && trends.data?.length) {
      const max = Math.max(...trends.data.map(d => d.value));
      trends.data.forEach((point, i) => {
        if (bars[i]) {
          bars[i].style.height = `${(point.value / max) * 100}%`;
          bars[i].title = `${point.period}: ${point.value}%`;
        }
      });
    }
  } catch (err) {
    log.warn('Attendance trend rendering failed');
  }
}

async function renderRiskSummary() {
  try {
    const riskData = await getRiskSummary();
    const total = riskData.total_students || 1;
    const fills = document.querySelectorAll('.g-fill');
    const vals = document.querySelectorAll('.g-val');

    const atRisk = (((riskData.high || 0) + (riskData.critical || 0)) / total * 100).toFixed(0);

    if (fills[2]) fills[2].style.width = `${atRisk}%`;
    if (vals[2]) vals[2].textContent = `${atRisk}%`;
    if (vals[3]) vals[3].textContent = total;
  } catch (err) {
    log.warn('Risk summary rendering failed');
  }
}

// ─────────────────────────────────────────────────────────
// Auto-initialization
// ─────────────────────────────────────────────────────────
async function init() {
  log.group('EduGuard Frontend Initialization');

  try {
    // Try to restore session from token
    if (STATE.token) {
      try {
        const user = await getCurrentUser();
        log.info('Restored session:', user);
      } catch (err) {
        log.warn('Session token invalid, attempting login with demo credentials');
      }
    }

    // Auto-login with demo account if no token
    if (!STATE.token) {
      try {
        await login('admin@eduguard.ai', 'Admin@1234');
        log.info('Auto-login with demo credentials successful');
      } catch (err) {
        log.warn('Demo auto-login failed - backend may not be running');
      }
    }

    // Render all dashboard components
    await renderDashboard();
    await renderAttendanceTrend();
    await renderRiskSummary();

    log.info('Frontend initialization complete');
  } catch (err) {
    log.error('Initialization failed:', err);
  }

  log.groupEnd();
}

// Run on page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', init);
}

// ─────────────────────────────────────────────────────────
// Export for use in HTML/console
// ─────────────────────────────────────────────────────────
window.EduGuard = {
  api: {
    login,
    register,
    logout,
    getCurrentUser,
  },
  dashboard: {
    getSummary: getDashboardSummary,
    getTrends: getDashboardTrends,
  },
  risk: {
    getSummary: getRiskSummary,
    getStudentRisk,
  },
  students: {
    getStudents,
    getStudent,
  },
  alerts: {
    getAlerts,
  },
  interventions: {
    getInterventions,
  },
  state: STATE,
  config: CONFIG,
};

log.info('✓ EduGuard API client ready. Access via window.EduGuard in console.');
