// src/services/attendanceService.ts

import { Asset } from 'react-native-image-picker';
import {
  ERP_BASE_URL,
  ERP_FOS_ATTENDANCE_DOCTYPE,
  ERP_FOS_ATTENDANCE_URL,
  ERP_GET_LOGGED_USER_URL,
  ERP_UPLOAD_FILE_URL,
} from '../config/erpConfig';

// Status field options in FOS Attendance
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

// Options shown in bottom sheet & dropdown
export const ATTENDANCE_OPTIONS: AttendanceOption[] = [
  { id: 'FULL_DAY', label: 'Full Day' },
  { id: 'LEAVE', label: 'Leave' },
  { id: 'HALF_DAY_FIRST', label: 'Half Day (First Half)' },
  { id: 'HALF_DAY_SECOND', label: 'Half Day (Second Half)' },
];

export function getLabelForType(type: AttendanceTypeId): string {
  return ATTENDANCE_OPTIONS.find(o => o.id === type)?.label ?? 'Full Day';
}

// Simple rule: if user selects "Leave" → Status = Leave, else Present
export function getStatusForType(type: AttendanceTypeId): AttendanceStatus {
  if (type === 'LEAVE') return 'Leave';
  return 'Present';
}

// ─────────────────────────────────────────────
// Helpers to talk to ERPNext
// ─────────────────────────────────────────────

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
    throw new Error('Invalid response from get_logged_user');
  }

  return email;
}

async function fetchUserFullName(userEmail: string): Promise<string> {
  const url = `${ERP_BASE_URL}/api/resource/User/${encodeURIComponent(
    userEmail,
  )}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    // Fallback: just return email if we cannot fetch full name
    return userEmail;
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
    console.warn('Rollback: failed to delete attendance doc:', err);
  }
}

// ─────────────────────────────────────────────
// Public API for AttendanceScreen
// ─────────────────────────────────────────────

export interface MarkAttendanceParams {
  attendanceTypeId: AttendanceTypeId;
  selfie: Asset;
}

export interface MarkAttendanceResult {
  attendanceName: string;
  status: AttendanceStatus;
  attendanceType: string;
  userEmail: string;
  fullName: string;
}

// 1) Uses current ERP session (cookie from /api/method/login)
// 2) Gets logged in user email + full name
// 3) POST /api/resource/FOS Attendance
// 4) Uploads selfie & attaches
// 5) Updates `selfie` field with file_url
// 6) If any step after create fails → delete created doc & throw
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
      status, // Present / Leave (Absent can be handled by other flows)
      attendance_type: attendanceTypeLabel,
    };

    const createRes = await fetch(ERP_FOS_ATTENDANCE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(docPayload),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(
        `Failed to create attendance: ${createRes.status} ${text || ''}`,
      );
    }

    const createdJson = await createRes.json();
    attendanceName =
      createdJson?.data?.name || createdJson?.data?.id || '';

    if (!attendanceName) {
      throw new Error('Attendance created but no document name returned');
    }

    // Step 3: Upload selfie and attach to created doc
    const formData = new FormData();
    formData.append('file', {
      uri: selfie.uri,
      name: selfie.fileName || `selfie-${attendanceName}.jpg`,
      type: selfie.type || 'image/jpeg',
    } as any);
    formData.append('doctype', ERP_FOS_ATTENDANCE_DOCTYPE);
    formData.append('docname', attendanceName);
    formData.append('fieldname', 'selfie'); // Attach Image field name
    formData.append('is_private', '0');

    const uploadRes = await fetch(ERP_UPLOAD_FILE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // IMPORTANT: Do NOT set 'Content-Type' manually for FormData in React Native
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(
        `Failed to upload selfie: ${uploadRes.status} ${text || ''}`,
      );
    }

    const uploadJson = await uploadRes.json();
    const fileUrl: string =
      uploadJson?.message?.file_url ||
      uploadJson?.file_url ||
      uploadJson?.message?.file_url;

    if (!fileUrl) {
      throw new Error('Selfie upload did not return file_url');
    }

    // Step 4: Ensure Selfie field is set with file_url
    const updateRes = await fetch(attendanceDocUrl(attendanceName), {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selfie: fileUrl }),
    });

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
