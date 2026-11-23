const BASE_URL = '/api/v1';

const getHeaders = (token = null, adminPin = null) => {
  const headers = { 'Content-Type': 'application/json' };
  const authToken = token || localStorage.getItem('cc_staff_token');
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (adminPin) {
    headers['x-admin-pin'] = adminPin;
  }
  return headers;
};

const handleResponse = async (res) => {
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error?.message || 'Something went wrong');
    error.code = data.error?.code;
    error.status = res.status;
    throw error;
  }
  return data.data;
};

export const api = {
  // Public
  getEventInfo: async (eventId = null, ref = null) => {
    let url = `${BASE_URL}/event`;
    const params = [];
    if (eventId) params.push(`eventId=${encodeURIComponent(eventId)}`);
    if (ref) params.push(`ref=${encodeURIComponent(ref)}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    const res = await fetch(url);
    return handleResponse(res);
  },

  getPublicStats: async () => {
    const res = await fetch(`${BASE_URL}/event/stats`);
    return handleResponse(res);
  },

  getAllPublicEvents: async () => {
    const res = await fetch(`${BASE_URL}/event/all`);
    return handleResponse(res);
  },

  createOrder: async (payload) => {
    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  getOrderStatus: async (orderId) => {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/status`);
    return handleResponse(res);
  },

  getOrderPayUParams: async (orderId) => {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/payu-params`);
    return handleResponse(res);
  },

  verifyGatewayPayment: async (orderId, payload = {}) => {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/verify-gateway`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  mockPayOrder: async (orderId) => {
    const res = await fetch(`${BASE_URL}/orders/${orderId}/mock-pay`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  getPass: async (orderId, phone = null) => {
    let url = `${BASE_URL}/passes/${orderId}`;
    if (phone) url += `?phone=${encodeURIComponent(phone)}`;
    const res = await fetch(url);
    return handleResponse(res);
  },

  lookupMyTicket: async (payload) => {
    const res = await fetch(`${BASE_URL}/passes/my-ticket`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  createCashToken: async (payload) => {
    const res = await fetch(`${BASE_URL}/cash-tokens`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  getCashToken: async (id) => {
    const res = await fetch(`${BASE_URL}/cash-tokens/${id}`);
    return handleResponse(res);
  },

  // Staff Auth
  staffLogin: async (payload) => {
    const res = await fetch(`${BASE_URL}/auth/staff-login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  getMe: async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // POS
  posConfig: async () => {
    const res = await fetch(`${BASE_URL}/pos/config`, { headers: getHeaders() });
    return handleResponse(res);
  },

  posLookupToken: async (tokenNo) => {
    const res = await fetch(`${BASE_URL}/pos/tokens/${tokenNo}`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  posConfirmToken: async (tokenNo, cashTenderedPaise, expectedAmountPaise) => {
    const res = await fetch(`${BASE_URL}/pos/tokens/${tokenNo}/confirm`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ cashTenderedPaise, expectedAmountPaise })
    });
    return handleResponse(res);
  },

  posWalkin: async (payload) => {
    const res = await fetch(`${BASE_URL}/pos/walkin`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  posUndo: async (orderId) => {
    const res = await fetch(`${BASE_URL}/pos/undo`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ orderId })
    });
    return handleResponse(res);
  },

  posShiftSummary: async () => {
    const res = await fetch(`${BASE_URL}/pos/shift/summary`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // Gate Scanner
  gateScan: async (payload) => {
    const res = await fetch(`${BASE_URL}/gate/scan`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  gateStats: async () => {
    const res = await fetch(`${BASE_URL}/gate/stats`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // Admin
  adminMetrics: async (eventId = null) => {
    const url = (eventId && eventId !== 'ALL') ? `${BASE_URL}/admin/metrics?eventId=${encodeURIComponent(eventId)}` : `${BASE_URL}/admin/metrics`;
    const res = await fetch(url, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  adminGetAnalytics: async (eventId = null) => {
    const url = (eventId && eventId !== 'ALL') ? `${BASE_URL}/admin/analytics?eventId=${encodeURIComponent(eventId)}` : `${BASE_URL}/admin/analytics`;
    const res = await fetch(url, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  adminSearchPasses: async (q) => {
    const res = await fetch(`${BASE_URL}/admin/passes?q=${encodeURIComponent(q || '')}`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  adminGetPassDetail: async (id) => {
    const res = await fetch(`${BASE_URL}/admin/passes/${id}`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  adminForceReset: async (id, reason) => {
    const res = await fetch(`${BASE_URL}/admin/passes/${id}/force-reset`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason })
    });
    return handleResponse(res);
  },

  adminVoidPass: async (id, reason) => {
    const res = await fetch(`${BASE_URL}/admin/passes/${id}/void`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason })
    });
    return handleResponse(res);
  },

  adminUpdateSettings: async (settings, adminPin) => {
    const res = await fetch(`${BASE_URL}/admin/settings`, {
      method: 'PATCH',
      headers: getHeaders(null, adminPin),
      body: JSON.stringify(settings)
    });
    return handleResponse(res);
  },

  adminGetUsers: async () => {
    const res = await fetch(`${BASE_URL}/admin/users`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  adminCreateUser: async (payload) => {
    const res = await fetch(`${BASE_URL}/admin/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  adminListEvents: async () => {
    const res = await fetch(`${BASE_URL}/admin/events`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  adminCreateEvent: async (payload) => {
    const res = await fetch(`${BASE_URL}/admin/events`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  adminGetPlatformOverview: async () => {
    const res = await fetch(`${BASE_URL}/admin/platform/overview`, {
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // Advanced SaaS & Gate Operations
  validateCoupon: async (codeOrPayload, subtotalPaise, eventId) => {
    const payload = typeof codeOrPayload === 'string'
      ? { code: codeOrPayload, amountPaise: subtotalPaise, subtotalPaise, eventId }
      : codeOrPayload;
    const res = await fetch(`${BASE_URL}/orders/validate-coupon`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  helpdeskSearch: async (q, eventId = null) => {
    const url = eventId
      ? `${BASE_URL}/gate/helpdesk/search?q=${encodeURIComponent(q)}&eventId=${encodeURIComponent(eventId)}`
      : `${BASE_URL}/gate/helpdesk/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: getHeaders() });
    return handleResponse(res);
  },

  helpdeskReissue: async (passId, reason) => {
    const res = await fetch(`${BASE_URL}/gate/helpdesk/reissue`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ passId, reason })
    });
    return handleResponse(res);
  },

  claimAddOnVoucher: async (orderIdOrPayload, addOnId) => {
    const payload = typeof orderIdOrPayload === 'string'
      ? { orderId: orderIdOrPayload, addOnId }
      : orderIdOrPayload;
    const res = await fetch(`${BASE_URL}/gate/merch/claim`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  adminTriggerEmergencyEvacuation: async (payload) => {
    const res = await fetch(`${BASE_URL}/admin/emergency-evacuation`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  adminPostAnnouncement: async (payload) => {
    const res = await fetch(`${BASE_URL}/admin/announcement`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  adminGetExecutiveReport: async (eventId = null) => {
    const url = eventId ? `${BASE_URL}/admin/executive-report?eventId=${encodeURIComponent(eventId)}` : `${BASE_URL}/admin/executive-report`;
    const res = await fetch(url, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Sponsor & Exhibition Stall Inquiries
  submitInquiry: async (payload) => {
    const res = await fetch(`${BASE_URL}/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  adminGetInquiries: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.eventId && params.eventId !== 'ALL') query.append('eventId', params.eventId);
    if (params.type) query.append('type', params.type);
    if (params.status) query.append('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${BASE_URL}/inquiries${qs}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  adminUpdateInquiryStatus: async (id, payload) => {
    const res = await fetch(`${BASE_URL}/inquiries/${id}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  adminMarkInquiriesRead: async (eventId = null) => {
    const res = await fetch(`${BASE_URL}/inquiries/mark-read`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ eventId })
    });
    return handleResponse(res);
  },

  adminMarkCommissionPaid: async (id) => {
    const res = await fetch(`${BASE_URL}/inquiries/${id}/commission-paid`, {
      method: 'PATCH',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  adminSetCommissionRate: async (partnerCommissionPct, adminPin) => {
    const res = await fetch(`${BASE_URL}/inquiries/commission-rate`, {
      method: 'PATCH',
      headers: getHeaders(null, adminPin),
      body: JSON.stringify({ partnerCommissionPct })
    });
    return handleResponse(res);
  },

  adminDeleteInquiry: async (id) => {
    const res = await fetch(`${BASE_URL}/inquiries/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // Staff account security
  adminResetStaffPin: async (userId, newPin, adminPin) => {
    const res = await fetch(`${BASE_URL}/admin/users/${encodeURIComponent(userId)}/pin`, { method: 'POST', headers: getHeaders(null, adminPin), body: JSON.stringify({ newPin }) });
    return handleResponse(res);
  },

  adminSetStaffActive: async (userId, active, adminPin) => {
    const res = await fetch(`${BASE_URL}/admin/users/${encodeURIComponent(userId)}/active`, { method: 'POST', headers: getHeaders(null, adminPin), body: JSON.stringify({ active }) });
    return handleResponse(res);
  },

  adminDemoPinAccounts: async () => {
    const res = await fetch(`${BASE_URL}/admin/security/demo-pins`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Cashier shifts
  posSetShiftFloat: async (openingFloatPaise) => {
    const res = await fetch(`${BASE_URL}/pos/shift/float`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ openingFloatPaise }) });
    return handleResponse(res);
  },

  posCloseShift: async (countedPaise, notes) => {
    const res = await fetch(`${BASE_URL}/pos/shift/close`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ countedPaise, notes }) });
    return handleResponse(res);
  },

  adminListShifts: async () => {
    const res = await fetch(`${BASE_URL}/admin/shifts`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Organizer settlement
  settlementsList: async () => {
    const res = await fetch(`${BASE_URL}/admin/settlements`, { headers: getHeaders() });
    return handleResponse(res);
  },

  settlementDetail: async (eventId) => {
    const res = await fetch(`${BASE_URL}/admin/settlements/${encodeURIComponent(eventId)}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  settlementRecordPayout: async (eventId, payout, adminPin) => {
    const res = await fetch(`${BASE_URL}/admin/settlements/${encodeURIComponent(eventId)}/payouts`, {
      method: 'POST',
      headers: getHeaders(null, adminPin),
      body: JSON.stringify(payout)
    });
    return handleResponse(res);
  },

  settlementVoidPayout: async (payoutId, reason, adminPin) => {
    const res = await fetch(`${BASE_URL}/admin/settlements/payouts/${encodeURIComponent(payoutId)}/void`, {
      method: 'POST',
      headers: getHeaders(null, adminPin),
      body: JSON.stringify({ reason })
    });
    return handleResponse(res);
  },

  settlementRequestPayout: async (eventId, request) => {
    const res = await fetch(`${BASE_URL}/admin/settlements/${encodeURIComponent(eventId)}/requests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(request)
    });
    return handleResponse(res);
  },

  settlementCloseRequest: async (requestId, reason = '') => {
    const res = await fetch(`${BASE_URL}/admin/settlements/requests/${encodeURIComponent(requestId)}/close`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason })
    });
    return handleResponse(res);
  },

  // Downloads with the auth header (no token in the URL)
  settlementDownloadStatement: async (eventId) => {
    const res = await fetch(`${BASE_URL}/admin/settlements/${encodeURIComponent(eventId)}/statement`, { headers: getHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message || 'Could not download statement');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement_${eventId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

