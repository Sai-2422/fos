// src/services/collectionService.ts

import { Asset } from 'react-native-image-picker';
import {
  ERP_BASE_URL,
  ERP_FOS_COLLECTION_DOCTYPE,
  ERP_FOS_COLLECTION_URL,
  ERP_GET_LOGGED_USER_URL,
  ERP_UPLOAD_FILE_URL,
} from '../config/erpConfig';

// ─────────────────────────────────────────────
// Types matching your API structure
// ─────────────────────────────────────────────

export type ModeType = 'UPI' | 'Cash' | 'Cheque' | 'NEFT';

export interface FOSCollectionPayload {
  fos_agent: string;
  customer: string;
  case?: string;
  collection_datetime?: string;
  amount: number;
  mode: ModeType;
  upi_txn_id?: string;
  pg_ref_no?: string;
  cheque_no?: string;
  bank_name?: string;
  is_deposited: 0 | 1;
}

export interface FOSCollectionResponse {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  fos_agent: string;
  customer: string;
  case?: string;
  collection_datetime: string;
  amount: number;
  mode: ModeType;
  upi_txn_id?: string;
  pg_ref_no?: string;
  cheque_no?: string;
  bank_name?: string;
  receipt_image?: string;
  is_deposited: number;
  docstatus: number;
}

export interface CreateCollectionParams {
  fos_agent: string;
  customer: string;
  case?: string;
  amount: string;
  mode: ModeType;
  upi_txn_id?: string;
  pg_ref_no?: string;
  cheque_no?: string;
  bank_name?: string;
  collection_datetime?: string;
  is_deposited: boolean;
  receipt_image?: Asset | null;
}

export interface CreateCollectionResult {
  collectionName: string;
  collection: FOSCollectionResponse;
}

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────

// ✅ Get CSRF Token from Frappe
async function getCSRFToken(): Promise<string> {
  try {
    const res = await fetch(
      `${ERP_BASE_URL}/api/method/frappe.auth.get_logged_user`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    const cookies = res.headers.get('set-cookie');
    const csrfMatch = cookies?.match(/csrf_token=([^;]+)/);

    if (csrfMatch && csrfMatch[1]) {
      return decodeURIComponent(csrfMatch[1]);
    }
    return '';
  } catch (error) {
    console.warn('Failed to get CSRF token:', error);
    return '';
  }
}

export async function fetchLoggedInUserEmail(): Promise<string> {
  const res = await fetch(ERP_GET_LOGGED_USER_URL, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
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
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) return userEmail;

  const json = await res.json();
  const data = json?.data || {};

  return (
    (data.full_name as string) ||
    (data.first_name as string) ||
    (data.username as string) ||
    userEmail
  );
}

function formatDateTimeForErp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function collectionDocUrl(name: string): string {
  return `${ERP_FOS_COLLECTION_URL}/${encodeURIComponent(name)}`;
}

async function deleteCollectionDoc(name: string): Promise<void> {
  try {
    await fetch(collectionDocUrl(name), {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Frappe-CSRF-Token': await getCSRFToken(),
      },
    });
  } catch (err) {
    console.warn('Rollback: failed to delete collection doc:', err);
  }
}

/**
 * ✅ Parse common user date formats to Date
 * Supports:
 *  - DD/MM/YYYY
 *  - DD-MM-YYYY
 *  - YYYY-MM-DD
 *  - Any of above + time (HH:mm or HH:mm:ss)
 */
function parseUserDateTime(input: string): Date | null {
  const raw = input.trim();
  if (!raw) return null;

  // 1) If already ISO-ish, let JS try
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  // 2) DD/MM/YYYY or DD-MM-YYYY with optional time
  const m = raw.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = m[4] ? Number(m[4]) : 0;
    const min = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;

    const d = new Date(yyyy, mm - 1, dd, hh, min, ss);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * ✅ Normalize user input to ERP datetime string
 * If input empty -> undefined (caller will insert "now")
 * If invalid -> throw error
 */
function normalizeCollectionDatetime(input?: string): string | undefined {
  const raw = (input || '').trim();
  if (!raw) return undefined;

  const parsed = parseUserDateTime(raw);
  if (!parsed) {
    throw new Error(
      'Invalid date format. Use DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD (optional time).',
    );
  }
  return formatDateTimeForErp(parsed);
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export async function createCollectionOnErp(
  params: CreateCollectionParams,
): Promise<CreateCollectionResult> {
  const {
    fos_agent,
    customer,
    case: caseId,
    amount,
    mode,
    upi_txn_id,
    pg_ref_no,
    cheque_no,
    bank_name,
    collection_datetime,
    is_deposited,
    receipt_image,
  } = params;

  let collectionName: string | null = null;

  try {
    const userEmail = await fetchLoggedInUserEmail();
    const fullName = await fetchUserFullName(userEmail);
    const csrfToken = await getCSRFToken();

    const now = new Date();

    // ✅ normalize input datetime to ERP format
    const erpDatetime =
      normalizeCollectionDatetime(collection_datetime) ||
      formatDateTimeForErp(now);

    const docPayload: FOSCollectionPayload = {
      fos_agent: fos_agent || fullName,
      customer,
      case: caseId || undefined,
      collection_datetime: erpDatetime,
      amount: parseFloat(amount as any),
      mode,
      upi_txn_id: upi_txn_id || undefined,
      pg_ref_no: pg_ref_no || undefined,
      cheque_no: cheque_no || undefined,
      bank_name: bank_name || undefined,
      is_deposited: is_deposited ? 1 : 0,
    };

    console.log('📤 Creating collection:', docPayload);

    const createRes = await fetch(ERP_FOS_COLLECTION_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(docPayload),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error('❌ Create failed:', createRes.status, text);
      throw new Error(
        `Failed to create collection: ${createRes.status} ${text || ''}`,
      );
    }

    const createdJson = await createRes.json();
    collectionName = createdJson?.data?.name || '';

    if (!collectionName) {
      throw new Error('Collection created but no document name returned');
    }

    let fileUrl: string | undefined;

    if (receipt_image && receipt_image.uri) {
      const formData = new FormData();
      formData.append('file', {
        uri: receipt_image.uri,
        name: receipt_image.fileName || `receipt-${collectionName}.jpg`,
        type: receipt_image.type || 'image/jpeg',
      } as any);
      formData.append('doctype', ERP_FOS_COLLECTION_DOCTYPE);
      formData.append('docname', collectionName);
      formData.append('fieldname', 'receipt_image');
      formData.append('is_private', '0');

      const uploadRes = await fetch(ERP_UPLOAD_FILE_URL, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'X-Frappe-CSRF-Token': csrfToken,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(
          `Failed to upload receipt: ${uploadRes.status} ${text || ''}`,
        );
      }

      const uploadJson = await uploadRes.json();
      fileUrl =
        uploadJson?.message?.file_url ||
        uploadJson?.file_url ||
        uploadJson?.message?.file_url;

      if (!fileUrl) {
        throw new Error('Receipt upload did not return file_url');
      }

      const updateRes = await fetch(collectionDocUrl(collectionName), {
        method: 'PUT',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ receipt_image: fileUrl }),
      });

      if (!updateRes.ok) {
        const text = await updateRes.text();
        throw new Error(
          `Failed to update receipt field: ${updateRes.status} ${text || ''}`,
        );
      }
    }

    const fetchRes = await fetch(collectionDocUrl(collectionName), {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!fetchRes.ok) {
      throw new Error('Failed to fetch created collection');
    }

    const fetchJson = await fetchRes.json();
    const collection: FOSCollectionResponse = fetchJson.data;

    return { collectionName, collection };
  } catch (error) {
    console.error('❌ Error in createCollectionOnErp:', error);
    if (collectionName) await deleteCollectionDoc(collectionName);
    throw error;
  }
}

/**
 * ✅ Fetch collections for the *agent* (FOS Agent), not by owner.
 * This makes collections visible even if they were created by Admin,
 * as long as `fos_agent` is set to this agent.
 *
 * Optional param `agentNameOverride` lets you pass the name from the app
 * (e.g. HomeScreen fullName). If not provided, it derives from User document.
 */
export async function fetchCollectionsForLoggedInUser(
  agentNameOverride?: string,
): Promise<FOSCollectionResponse[]> {
  const userEmail = await fetchLoggedInUserEmail();

  let agentName = (agentNameOverride || '').trim();

  // If app didn't pass agent name, derive from User doc
  if (!agentName) {
    try {
      const fullName = await fetchUserFullName(userEmail);
      agentName = (fullName || '').trim();
    } catch (err) {
      console.warn(
        'Failed to fetch full name while loading collections, falling back to owner filter:',
        err,
      );
    }
  }

  let filters: string;

  if (agentName) {
    // ✅ Primary filter: by fos_agent (matches FOS Agent name / full name)
    filters = JSON.stringify([['fos_agent', '=', agentName]]);
  } else {
    // 🔁 Safety fallback: old behavior (by owner) if we couldn't resolve agentName
    filters = JSON.stringify([['owner', '=', userEmail]]);
  }

  let url = `${ERP_FOS_COLLECTION_URL}?filters=${encodeURIComponent(filters)}`;
  url += `&fields=["*"]&limit_page_length=999`;
  url += `&order_by=creation desc`;

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch collections: ${res.status} ${text || ''}`);
  }

  const json = await res.json();
  return json?.data || [];
}

export async function fetchAllCollections(): Promise<FOSCollectionResponse[]> {
  let url = `${ERP_FOS_COLLECTION_URL}?fields=["*"]&limit_page_length=999&order_by=creation desc`;

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch collections: ${res.status} ${text || ''}`);
  }

  const json = await res.json();
  return json?.data || [];
}

export async function deleteCollection(name: string): Promise<void> {
  const csrfToken = await getCSRFToken();

  const res = await fetch(collectionDocUrl(name), {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete collection: ${res.status} ${text || ''}`);
  }
}

async function ensureCustomerExists(name: string): Promise<void> {
  const filters = JSON.stringify([['name', '=', name]]);
  const url =
    `${ERP_BASE_URL}/api/resource/Customer` +
    `?fields=["name"]&filters=${encodeURIComponent(
      filters,
    )}&limit_page_length=1`;

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error('Failed to validate Customer in ERPNext.');
  }

  const json = await res.json();
  if (!json.data || json.data.length === 0) {
    throw new Error(
      `Customer "${name}" not found in ERPNext. Please create it first.`,
    );
  }
}
