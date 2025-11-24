// src/services/attendanceService.ts

import { Asset } from 'react-native-image-picker';
import {
  ERP_BASE_URL,
  ERP_FOS_ATTENDANCE_DOCTYPE,
  ERP_FOS_ATTENDANCE_URL,
  ERP_GET_LOGGED_USER_URL,
  ERP_UPLOAD_FILE_URL,
} from '../config/erpConfig';

// ─────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────

// Status field options in FOS Attendance (ERP side)
export type AttendanceStatus = 'Present' | 'Absent' | 'Leave';

// Internal IDs for UI → ERP mapping
export type AttendanceTypeId =
  | 'FULL_DAY'
  | 'LEAVE'
  | 'HALF_DAY_FIRST'
  | 'HALF_DAY_SECOND';

export interface AttendanceOption {
  id: AttendanceTypeId;
  label: string;
}

// Options shown in bottom sheet & dropdown in AttendanceScreen
export const ATTENDANCE_OPTIONS: AttendanceOption[] = [
  { id: 'FULL_DAY', label: 'Full Day' },
  { id: 'LEAVE', label: 'Leave' },
  { id: 'HALF_DAY_FIRST', label: 'Half Day (First Half)' },
  { id: 'HALF_DAY_SECOND', label: 'Half Day (Second Half)' },
];

// Shape of one FOS Attendance row from ERP
export interface FOSAttendanceRow {
  name: string;
  attendance_date: string;
  status: AttendanceStatus;
  attendance_type: string;
}

// Parameters passed from UI when marking attendance
export interface MarkAttendanceParams {
  attendanceTypeId: AttendanceTypeId;
  selfie: Asset;
}

// Result returned to UI after marking attendance
export interface MarkAttendanceResult {
  attendanceName: string;
  status: AttendanceStatus;
  attendanceType: string;
  attendanceDate: string;
  userEmail: string;
  fullName: string;
}

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

// Get logged-in ERP user email from session cookie
async function fetchLoggedInUserEmail(): Promise<string> {
  const res = await fetch(ERP_GET_LOGGED_USER_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to get logged-in user: ${res.status} ${text || ''}`,
    );
  }

  const json = await res.json();
  const email = json?.message;

  if (typeof email !== 'string' || !email) {
    throw new Error('Invalid logged user response from ERP');
  }

  return email;
}

// Get full name of user from User doctype
async function fetchUserFullName(userEmail: string): Promise<string> {
  const url = `${ERP_BASE_URL}/api/resource/User/${encodeURIComponent(
    userEmail,
  )}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch user profile: ${res.status} ${text || ''}`,
    );
  }

  const json = await res.json();
  const data = json?.data || {};

  return (
    (data.full_name as string) ||
    (data.first_name as string) ||
    (data.username as string) ||
    userEmail
  );
}

// Format JS Date → "YYYY-MM-DD" (ERP API expects this)
function formatDateForErp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Map UI type → ERP Status field
function getStatusForType(typeId: AttendanceTypeId): AttendanceStatus {
  switch (typeId) {
    case 'LEAVE':
      return 'Leave';
    default:
      // Full day or half day we still treat as Present for now
      return 'Present';
  }
}

// Map UI type → ERP Attendance Type label
function getLabelForType(typeId: AttendanceTypeId): string {
  const found = ATTENDANCE_OPTIONS.find(o => o.id === typeId);
  return found?.label ?? 'Full Day';
}

// Build single doc URL like /api/resource/FOS%20Attendance/FOS%20A-0001
function attendanceDocUrl(name: string): string {
  return `${ERP_FOS_ATTENDANCE_URL}/${encodeURIComponent(name)}`;
}

// Try to delete attendance on error (best-effort rollback)
async function deleteAttendanceDoc(name: string): Promise<void> {
  try {
    await fetch(attendanceDocUrl(name), {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    console.warn('Failed to rollback attendance doc', err);
  }
}

// ─────────────────────────────────────────────
// File upload helper (Selfie)
// ─────────────────────────────────────────────
//
// IMPORTANT:
// - We send `doctype` + `docname` in the SAME upload_file request.
// - ERP then creates & attaches the File correctly.
// - No extra attach_file call.
//
async function uploadSelfieFile(
  selfie: Asset,
  attendanceName: string,
): Promise<{
  file_url: string;
  file_name: string;
}> {
  if (!selfie.uri) {
    throw new Error('Invalid selfie asset');
  }

  if (!attendanceName) {
    throw new Error('Cannot upload selfie without attendance document name');
  }

  const formData = new FormData();

  formData.append('file', {
    // @ts-ignore React Native FormData file object
    uri: selfie.uri,
    name: selfie.fileName || 'attendance_selfie.jpg',
    type: selfie.type || 'image/jpeg',
  });

  // Link File directly to the FOS Attendance doc
  formData.append('is_private', '0');
  formData.append('doctype', ERP_FOS_ATTENDANCE_DOCTYPE);
  formData.append('docname', attendanceName);

  const res = await fetch(ERP_UPLOAD_FILE_URL, {
    method: 'POST',
    body: formData,
    headers: {
      // NOTE: don't set Content-Type; fetch sets multipart boundary
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to upload selfie: ${res.status} ${text || ''}`,
    );
  }

  const json = await res.json();
  const data: any = json?.message || json?.data || {};

  const file_url = data?.file_url as string | undefined;
  const file_name =
    (data?.file_name as string | undefined) ||
    (data?.name as string | undefined);

  if (!file_url) {
    throw new Error('Invalid upload_file response (missing file_url)');
  }

  return {
    file_url,
    file_name: file_name || '',
  };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
//
// Flow:
// 1) Uses current ERP session (cookie from /api/method/login)
// 2) Gets logged-in user email + full name
// 3) POST /api/resource/FOS Attendance (create doc)
// 4) Uploads selfie with doctype+docname so it’s attached to the doc
// 5) Updates `selfie` field on FOS Attendance with file_url (via set_value)
// 6) If any step after create fails → delete created doc & throw
//
export async function markAttendanceOnErp(
  params: MarkAttendanceParams,
): Promise<MarkAttendanceResult> {
  const { attendanceTypeId, selfie } = params;

  if (!selfie || !selfie.uri) {
    throw new Error('Selfie image is required to mark attendance');
  }

  let attendanceName: string | null = null;

  try {
    // Step 1: Get logged in user (email) & full name
    const userEmail = await fetchLoggedInUserEmail();
    const fullName = await fetchUserFullName(userEmail);

    // Step 2: Prepare FOS Attendance payload
    const attendanceDate = formatDateForErp(new Date());
    const status = getStatusForType(attendanceTypeId);
    const attendanceTypeLabel = getLabelForType(attendanceTypeId);

    const docPayload = {
      fos_agent: fullName, // FOS Agent - logged in user's name
      user: userEmail, // User - logged in user's email
      attendance_date: attendanceDate,
      status, // Present / Leave
      attendance_type: attendanceTypeLabel,
    };

    const createRes = await fetch(ERP_FOS_ATTENDANCE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: docPayload }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(
        `Failed to create attendance: ${createRes.status} ${text || ''}`,
      );
    }

    const createdJson = await createRes.json();
    const createdData = createdJson?.data;
    attendanceName = (createdData?.name as string) || null;

    if (!attendanceName) {
      throw new Error('Invalid attendance create response (no name)');
    }

    // Step 3: Upload selfie (also attaches to this Attendance doc)
    const uploadInfo = await uploadSelfieFile(selfie, attendanceName);

    // Step 4: Update selfie field with frappe.client.set_value (FIXED)
    const updatePayload = {
      doctype: ERP_FOS_ATTENDANCE_DOCTYPE,
      name: attendanceName,
      fieldname: 'selfie',
      value: uploadInfo.file_url,
    };

    const updateRes = await fetch(
      `${ERP_BASE_URL}/api/method/frappe.client.set_value`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      },
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(
        `Failed to update selfie field: ${updateRes.status} ${text || ''}`,
      );
    }

    // All good – return details
    return {
      attendanceName,
      status,
      attendanceType: attendanceTypeLabel,
      attendanceDate,
      userEmail,
      fullName,
    };
  } catch (error) {
    // Any failure after doc creation → rollback
    if (attendanceName) {
      await deleteAttendanceDoc(attendanceName);
    }
    throw error;
  }
}

// Fetch today's attendance for current ERP user (if any)
export async function fetchTodayAttendanceForLoggedInUser(): Promise<FOSAttendanceRow | null> {
  const userEmail = await fetchLoggedInUserEmail();
  const today = formatDateForErp(new Date());

  const params = new URLSearchParams();
  params.append(
    'filters',
    JSON.stringify([
      ['user', '=', userEmail],
      ['attendance_date', '=', today],
    ]),
  );
  params.append(
    'fields',
    JSON.stringify(['name', 'attendance_date', 'status', 'attendance_type']),
  );
  params.append('limit_page_length', '1');

  const url = `${ERP_FOS_ATTENDANCE_URL}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch today's attendance: ${res.status} ${text || ''}`,
    );
  }

  const json = await res.json();
  const rows = json?.data as any[];

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    name: row.name as string,
    attendance_date: row.attendance_date as string,
    status: row.status as AttendanceStatus,
    attendance_type: row.attendance_type as string,
  };
}

// Fetch previous N attendance records for current user (history list)
export async function fetchAttendanceHistoryForLoggedInUser(
  limit = 50,
): Promise<FOSAttendanceRow[]> {
  const userEmail = await fetchLoggedInUserEmail();

  const params = new URLSearchParams();
  params.append(
    'filters',
    JSON.stringify([['user', '=', userEmail]]),
  );
  params.append(
    'fields',
    JSON.stringify(['name', 'attendance_date', 'status', 'attendance_type']),
  );
  params.append('limit_page_length', String(limit));
  params.append('order_by', 'attendance_date desc');

  const url = `${ERP_FOS_ATTENDANCE_URL}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch attendance history: ${res.status} ${text || ''}`,
    );
  }

  const json = await res.json();
  const rows = json?.data as any[];

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(row => ({
    name: row.name as string,
    attendance_date: row.attendance_date as string,
    status: row.status as AttendanceStatus,
    attendance_type: row.attendance_type as string,
  }));
}
