// Root ERPNext URL (without /app/home or trailing slash)
export const ERP_BASE_URL = 'https://erp.pradisystechnologies.in';

// ─────────────────────────────────────────────
// Auth-related endpoints
// ─────────────────────────────────────────────

export const ERP_LOGIN_PATH = '/api/method/login';
export const ERP_LOGIN_URL = `${ERP_BASE_URL}${ERP_LOGIN_PATH}`;

export const ERP_LOGOUT_PATH = '/api/method/logout';
export const ERP_LOGOUT_URL = `${ERP_BASE_URL}${ERP_LOGOUT_PATH}`;

// Get currently logged-in ERP user (returns email in `message`)
export const ERP_GET_LOGGED_USER_PATH =
  '/api/method/frappe.auth.get_logged_user';
export const ERP_GET_LOGGED_USER_URL = `${ERP_BASE_URL}${ERP_GET_LOGGED_USER_PATH}`;

// ─────────────────────────────────────────────
// Generic resource / method bases
// ─────────────────────────────────────────────

export const ERP_RESOURCE_BASE = `${ERP_BASE_URL}/api/resource`;
export const ERP_METHOD_BASE = `${ERP_BASE_URL}/api/method`;

// ─────────────────────────────────────────────
// FOS Attendance specific
// ─────────────────────────────────────────────

export const ERP_FOS_ATTENDANCE_DOCTYPE = 'FOS Attendance';
export const ERP_FOS_ATTENDANCE_URL = `${ERP_RESOURCE_BASE}/${encodeURIComponent(
  ERP_FOS_ATTENDANCE_DOCTYPE,
)}`;

// File upload endpoint (for Selfie / KYC images)
export const ERP_UPLOAD_FILE_PATH = '/api/method/upload_file';
export const ERP_UPLOAD_FILE_URL = `${ERP_BASE_URL}${ERP_UPLOAD_FILE_PATH}`;

// ─────────────────────────────────────────────
// FOS Case (used for My List screen)
// ─────────────────────────────────────────────

export const ERP_FOS_CASE_DOCTYPE = 'FOS Case';
export const ERP_FOS_CASE_PATH = `/api/resource/${ERP_FOS_CASE_DOCTYPE}`;
export const ERP_FOS_CASE_URL = `${ERP_BASE_URL}${ERP_FOS_CASE_PATH}`;

// FOS Visit KYC (child table of FOS Case)
export const ERP_FOS_VISIT_KYC_DOCTYPE = 'FOS Visit KYC';
export const ERP_FOS_VISIT_KYC_URL = `${ERP_RESOURCE_BASE}/${encodeURIComponent(
  ERP_FOS_VISIT_KYC_DOCTYPE,
)}`;

// Generic set_value method (we'll use this to update fields on FOS Case)
export const ERP_SET_VALUE_PATH = '/api/method/frappe.client.set_value';
export const ERP_SET_VALUE_URL = `${ERP_BASE_URL}${ERP_SET_VALUE_PATH}`;

// ─────────────────────────────────────────────
// FOS Collection & Deposite
// ─────────────────────────────────────────────

export const ERP_FOS_COLLECTION_DOCTYPE = 'FOS Collection';
export const ERP_FOS_COLLECTION_URL = `${ERP_BASE_URL}/api/resource/FOS Collection`;

// ─────────────────────────────────────────────
// Display values
// ─────────────────────────────────────────────

// Company name for display in UI
export const COMPANY_NAME = 'ePradisys Technologies'; // change if needed

// Mobile app display name (used on home screen header)
export const APP_DISPLAY_NAME = 'ePravaah';
