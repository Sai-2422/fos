// Root ERPNext URL (without /app/home or trailing slash)
export const ERP_BASE_URL = 'https://erp.pradisystechnologies.in';

// Standard Frappe/ERPNext login endpoint
export const ERP_LOGIN_PATH = '/api/method/login';
export const ERP_LOGIN_URL = `${ERP_BASE_URL}${ERP_LOGIN_PATH}`;

// Standard Frappe/ERPNext logout endpoint
export const ERP_LOGOUT_PATH = '/api/method/logout';
export const ERP_LOGOUT_URL = `${ERP_BASE_URL}${ERP_LOGOUT_PATH}`;

// Company name for display in UI
export const COMPANY_NAME = 'ePradisys Technologies'; // change if needed

// Mobile app display name (used on home screen header)
export const APP_DISPLAY_NAME = 'FOS Collection';
