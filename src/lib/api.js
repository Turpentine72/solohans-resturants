/**
 * MongoDB-ready API client for Solohans Delicious Meals
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const getToken = () => localStorage.getItem('solohans_token');
const setToken = (token) => localStorage.setItem('solohans_token', token);
export const clearToken = () => localStorage.removeItem('solohans_token');

const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
});

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    let err;
    try {
      err = await res.json();
    } catch {
      // Body wasn't valid JSON — likely a proxy/timeout page (502/504) or an
      // empty response, not our Express server's own error handler. Grab
      // whatever text is there so the real problem is visible instead of a
      // generic "API error".
      let bodyText = '';
      try { bodyText = (await res.clone().text() || '').trim(); } catch { /* ignore */ }
      err = { message: res.statusText ? `${res.statusText} (${res.status})` : `Request failed (${res.status})${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}` };
    }

    // ✅ Staff Account Status Management — forced logout. This is the single
    // choke point every API call passes through, so it catches deactivation
    // regardless of which page or action triggered the request. We only act
    // on the specific 401/403 messages the backend uses for this (session
    // invalidated / account deactivated) — an ordinary "wrong password" on
    // the login form is untouched and handled by the caller as before.
    if (res.status === 401 || res.status === 403) {
      const msg = err.message || '';
      const isForcedLogout = msg.includes('deactivated') || msg.includes('Session expired');
      const onLoginPage = window.location.pathname.includes('/admin/login');
      if (isForcedLogout && !onLoginPage) {
        clearToken();
        window.location.href = `/admin/login?sessionMsg=${encodeURIComponent(msg)}`;
        return new Promise(() => {}); // navigation is already underway — never resolve
      }
    }

    throw new Error(err.message || 'API error');
  }
  return res.json();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const auth = {
  login: async (email, password) => {
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.token) setToken(data.token);
    return data;
  },
  logout: () => clearToken(),
  me: () => request('/auth/me'),
  getSession: () => {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) { clearToken(); return null; }
      return payload;
    } catch { clearToken(); return null; }
  },
  requestPasswordReset: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  requestChangePassword: (currentPassword, newPassword, confirmPassword) =>
    request('/auth/change-password/request', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) }),
  resendChangePasswordOtp: () => request('/auth/change-password/resend', { method: 'POST' }),
  verifyChangePassword: (otp) => request('/auth/change-password/verify', { method: 'POST', body: JSON.stringify({ otp }) }),
};

export const attendance = {
  getToday: () => request('/attendance/today'),
  checkIn: () => request('/attendance/check-in', { method: 'POST' }),
  checkOut: (tasksCompleted) => request('/attendance/check-out', { method: 'POST', body: JSON.stringify({ tasksCompleted }) }),
  getHistory: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/attendance/history${q ? '?' + q : ''}`);
  },
};

export const staff = {
  getAll: () => request('/staff'),
  create: (body) => request('/staff', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  changeRole: (id, role) => request(`/staff/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  setStatus: (id, status) => request(`/staff/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  resetPassword: (id, newPassword) => request(`/staff/${id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ newPassword }) }),
  delete: (id) => request(`/staff/${id}`, { method: 'DELETE' }),
};

export const roles = {
  getAll: () => request('/roles'),
  create: (label) => request('/roles', { method: 'POST', body: JSON.stringify({ label }) }),
  delete: (id) => request(`/roles/${id}`, { method: 'DELETE' }),
  getPermissionSchema: () => request('/roles/permission-schema'),
  updatePermissions: (id, permissions) => request(`/roles/${id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) }),
};

export const stock = {
  getToday: () => request('/stock/today'),
  setOpening: (items) => request('/stock/opening', { method: 'POST', body: JSON.stringify({ items }) }),
};

// ─── NEW: shared meal-combo inventory (rice scoops / spaghetti plastics /
// lunch boxes / extras) — separate from the per-menu-item `stock` above ───
export const inventory = {
  get: () => request('/inventory'),
  getPublicExtras: () => request('/inventory/public-extras'),
  restock: (item, quantity, reason) => request('/inventory/restock', { method: 'POST', body: JSON.stringify({ item, quantity, reason }) }),
  updateExtraPrice: (key, body) => request(`/inventory/extras/${key}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addExtra: (body) => request('/inventory/extras', { method: 'POST', body: JSON.stringify(body) }),
  setThreshold: (lowStockThreshold) => request('/inventory/threshold', { method: 'PATCH', body: JSON.stringify({ lowStockThreshold }) }),
  history: (limit = 100) => request(`/inventory/history?limit=${limit}`),
  reset: (item, newRemaining, reason) => request('/inventory/reset', { method: 'POST', body: JSON.stringify({ item, newRemaining, reason }) }),
  deleteExtra: (key, reason) => request(`/inventory/extras/${key}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
};

export const pos = {
  quote: (cart) => request('/pos/quote', { method: 'POST', body: JSON.stringify({ cart }) }),
  checkout: (body) => request('/pos/checkout', { method: 'POST', body: JSON.stringify(body) }),
};

export const dashboard = {
  summary: (period = 'daily') => request(`/dashboard/summary?period=${period}`),
};

export const websiteCheckout = {
  create: (body) => request('/orders/checkout', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Payment Reconciliation — MONEY ONLY (Cash/POS/Transfer/Website/
// Glovo/Chowdeck). Separate from the food-only `reconciliation` below. ────
export const paymentReconciliation = {
  getExpected: () => request('/payment-reconciliation/expected'),
  closeDay: (actual) => request('/payment-reconciliation/close-day', { method: 'POST', body: JSON.stringify({ actual }) }),
  getHistory: () => request('/payment-reconciliation/history'),
};

// ─── NEW: Shawarma Bread / Hotdog dual-level pack+piece inventory ────────
export const ingredients = {
  getReport: () => request('/ingredients/report'),
  getAll: () => request('/ingredients'),
  create: (data) => request('/ingredients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/ingredients/${id}`, { method: 'DELETE' }),
  reset: (id, newRemainingPieces, reason) => request(`/ingredients/${id}/reset`, { method: 'POST', body: JSON.stringify({ newRemainingPieces, reason }) }),
  restock: (key, packs) => request('/ingredients/restock', { method: 'POST', body: JSON.stringify({ key, packs }) }),
};

export const backup = {
  getAll: () => request('/backup'),
  createManual: () => request('/backup/manual', { method: 'POST' }),
  getSchedule: () => request('/backup/schedule'),
  updateSchedule: (data) => request('/backup/schedule', { method: 'PUT', body: JSON.stringify(data) }),
  restore: (id) => request(`/backup/${id}/restore`, { method: 'POST', body: JSON.stringify({ confirm: 'RESTORE' }) }),
  // Downloads require the Bearer token, so this can't be a plain <a href> —
  // fetch as a blob (with auth headers) and trigger the save dialog manually.
  download: async (id, filename) => {
    const res = await fetch(`${BASE_URL}/backup/${id}/download`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `backup-${id}.json.gz`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const staffActivity = {
  get: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/staff-activity${qs ? `?${qs}` : ''}`);
  },
};

export const globalReset = {
  run: () => request('/reset/transactional-data', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) }),
};

export const transfer = {
  getBanks: () => request('/transfer/banks').then((r) => r.data),
  createRecipient: (payload) => request('/transfer/recipient', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
  initiateTransfer: (payload) => request('/transfer/transfer', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
  finalizeTransfer: (payload) => request('/transfer/transfer/finalize', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
};

export const reconciliation = {
  getExpected: () => request('/reconciliation/expected'),
  closeDay: (actualCounts) => request('/reconciliation/close-day', { method: 'POST', body: JSON.stringify({ actualCounts }) }),
  getHistory: () => request('/reconciliation/history'),
};

export const auditLogs = {
  getAll: () => request('/audit-logs'),
  clear: () => request('/audit-logs', { method: 'DELETE' }),
};

export const expenses = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/expenses${q ? '?' + q : ''}`);
  },
  create: (body) => request('/expenses', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),
};

// ─── MENU ITEMS ───────────────────────────────────────────────────────────────
export const menuItems = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/menu-items${q ? '?' + q : ''}`);
  },
  getSignature: () => request('/menu-items?signature=true&limit=6'),
  create: (body) => request('/menu-items', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/menu-items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/menu-items/${id}`, { method: 'DELETE' }),
};

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
export const categories = {
  getAll: () => request('/categories'),
  create: (body) => request('/categories', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
};

// ─── ORDERS ───────────────────────────────────────────────────────────────────
export const orders = {
  create: (body) => request('/orders', { method: 'POST', body: JSON.stringify(body) }),
  getPaymentInfo: ({ order_id, email }) =>
    request(`/orders/payment-info?order_id=${encodeURIComponent(order_id)}&email=${encodeURIComponent(email)}`),
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/orders${q ? '?' + q : ''}`);
  },
  getOne: (id) => request(`/orders/${id}`),
  getReceipt: (id) => request(`/orders/receipt/${id}`),
  logReceiptPrint: (id) => request(`/orders/${id}/log-receipt-print`, { method: 'POST' }).catch(() => {}), // best-effort, never blocks printing
  getHistory: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/orders/history/unified${qs ? `?${qs}` : ''}`);
  },
  updateStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updatePaymentStatus: (id, payment_status) =>
    request(`/orders/${id}/payment-status`, { method: 'PATCH', body: JSON.stringify({ payment_status }) }),
  updateDeliveryFee: (id, delivery_fee) =>
    request(`/orders/${id}/delivery-fee`, { method: 'PATCH', body: JSON.stringify({ delivery_fee }) }),
  getWebsitePending: () => request('/orders/website-pending'),
  tagToMe: (id) => request(`/orders/${id}/tag-to-me`, { method: 'PATCH' }),
  reassign: (id, staffId, staffName) => request(`/orders/${id}/reassign`, { method: 'PATCH', body: JSON.stringify({ staffId, staffName }) }),
  setPaymentStatus: (id, payment_status) => request(`/orders/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ payment_status }) }),
  restore: (id) => request(`/orders/${id}/restore`, { method: 'PATCH' }),
  delete: (id) => request(`/orders/${id}`, { method: 'DELETE' }),          // soft delete
  permanentDelete: (id) => request(`/orders/${id}/permanent`, { method: 'DELETE' }),
};

// ─── CONTACTS ─────────────────────────────────────────────────────────────────
export const contacts = {
  send: (body) => request('/contacts', { method: 'POST', body: JSON.stringify(body) }),
  getAll: () => request('/contacts'),
  sendReply: (id, reply) => request(`/contacts/${id}/reply`, { method: 'PATCH', body: JSON.stringify({ reply }) }),
  delete: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
};

// ─── REVIEWS ──────────────────────────────────────────────────────────────────
export const reviews = {
  getApproved: () => request('/reviews?status=Approved'),
  getAll: () => request('/reviews'),
  create: (body) => request('/reviews', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),   // ✅ generic update
  updateStatus: (id, status) => request(`/reviews/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  toggleFeatured: (id, featured) => request(`/reviews/${id}/featured`, { method: 'PATCH', body: JSON.stringify({ featured }) }),
  sendReply: (id, reply) => request(`/reviews/${id}/reply`, { method: 'PATCH', body: JSON.stringify({ reply }) }),
  delete: (id) => request(`/reviews/${id}`, { method: 'DELETE' }),
};

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
export const uploadFile = async (file, folder = 'uploads') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.url;
};

// ─── SETTINGS ────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => request('/settings'),
  getAdmin: () => request('/settings/admin'),
  update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export const notifications = {
  getAll: () => request('/notifications'),
  markAsRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllAsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
  delete: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
};

// ─── PROMOS ───────────────────────────────────────────────────────────────────
export const promos = {
  getActive: () => request('/promos/active'),
  getAll: () => request('/promos'),
  create: (body) => request('/promos', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/promos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggle: (id) => request(`/promos/${id}/toggle`, { method: 'PATCH' }),
  delete: (id) => request(`/promos/${id}`, { method: 'DELETE' }),
};

// ─── GALLERY ──────────────────────────────────────────────────────────────────
export const payments = {
  verify: (reference, orderId) =>
    request('/payments/verify', { method: 'POST', body: JSON.stringify({ reference, orderId }) }),
  adminVerify: (reference, orderId) =>
    request('/payments/admin-verify', { method: 'POST', body: JSON.stringify({ reference, orderId }) }),
};

export const deliveryZones = {
  getActive: () => request('/delivery-zones/active'),
  getAll: () => request('/delivery-zones'),
  create: (body) => request('/delivery-zones', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/delivery-zones/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggle: (id) => request(`/delivery-zones/${id}/toggle`, { method: 'PATCH' }),
  delete: (id) => request(`/delivery-zones/${id}`, { method: 'DELETE' }),
};

export const gallery = {
  getPublic: () => request('/gallery'),
  getAdmin: () => request('/gallery/admin'),
  create: (body) => request('/gallery', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/gallery/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id) => request(`/gallery/${id}`, { method: 'DELETE' }),
};