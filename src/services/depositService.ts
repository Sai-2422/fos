// src/services/depositService.ts

import { Asset } from 'react-native-image-picker';
import { ERP_BASE_URL } from '../config/erpConfig';
import { FOSCollectionResponse } from './collectionService';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface FOSCashDepositItem {
  name?: string;
  collection: string;
  amount: number;
}

export interface FOSCashDepositPayload {
  fos_agent: string;
  deposit_date: string;
  bank_name?: string;
  branch?: string;
  deposit_location?: string;
  deposit_slip_no?: string;
  amount_deposited: number;
  collections: FOSCashDepositItem[];
}

export interface FOSCashDepositResponse {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: number;
  fos_agent: string;
  deposit_date: string;
  bank_name?: string;
  branch?: string;
  deposit_location?: string;
  deposit_slip_no?: string;
  amount_deposited: number;
  deposit_slip_image?: string;
  collections: FOSCashDepositItem[];
  doctype: 'FOS Cash Deposit';
}

export interface CreateDepositParams {
  fos_agent: string;
  deposit_date: string;
  bank_name?: string;
  branch?: string;
  deposit_location?: string;
  deposit_slip_no?: string;
  selected_collections: FOSCollectionResponse[];
  deposit_slip_image?: Asset | null;
}

// ─────────────────────────────────────────────
// API URLs
// ─────────────────────────────────────────────

const ERP_FOS_DEPOSIT_URL = `${ERP_BASE_URL}/api/resource/FOS Cash Deposit`;
const ERP_FOS_COLLECTION_URL = `${ERP_BASE_URL}/api/resource/FOS Collection`;
const ERP_UPLOAD_FILE_URL = `${ERP_BASE_URL}/api/method/upload_file`;
const ERP_GET_LOGGED_USER_URL = `${ERP_BASE_URL}/api/method/frappe.auth.get_logged_user`;

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────

async function getCSRFToken(): Promise<string> {
  try {
    const res = await fetch(ERP_GET_LOGGED_USER_URL, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

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

async function fetchLoggedInUserEmail(): Promise<string> {
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
    throw new Error(`Failed to get logged-in user: ${res.status} ${text || ''}`);
  }

  const json = await res.json();
  const email = json?.message;

  if (typeof email !== 'string' || !email) {
    throw new Error('Invalid response from get_logged_user');
  }

  return email;
}

async function fetchUserFullName(userEmail: string): Promise<string> {
  const url = `${ERP_BASE_URL}/api/resource/User/${encodeURIComponent(userEmail)}`;

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
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

function formatDateForErp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function depositDocUrl(name: string): string {
  return `${ERP_FOS_DEPOSIT_URL}/${encodeURIComponent(name)}`;
}

async function deleteDepositDoc(name: string): Promise<void> {
  try {
    const csrfToken = await getCSRFToken();
    await fetch(depositDocUrl(name), {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Frappe-CSRF-Token': csrfToken,
      },
    });
  } catch (err) {
    console.warn('Rollback: failed to delete deposit doc:', err);
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * ✅ Fetch undeposited collections for the logged-in user
 * Only show: is_deposited = 0 AND docstatus = 1 AND owner = current user
 */
// src/services/depositService.ts

// ✅ Show only logged-in user's collections with is_deposited = 0
export async function fetchUndepositedCollections(): Promise<FOSCollectionResponse[]> {
  try {
    console.log('📡 Fetching undeposited collections for logged-in user...');

    // 1) Logged-in ERP user email (same as owner field)
    const userEmail = await fetchLoggedInUserEmail();
    console.log('👤 Logged-in email (owner):', userEmail);

    // 2) Filters:
    //    - owner = userEmail      ✅ only this login
    //    - is_deposited = 0       ✅ only not deposited
    //    - docstatus = 1          ✅ only submitted collections
    const filters = JSON.stringify([
      ['owner', '=', userEmail],
      ['is_deposited', '=', 0],
     
    ]);

    let url = `${ERP_FOS_COLLECTION_URL}?filters=${encodeURIComponent(filters)}`;
    url +=
      '&fields=["name","customer","fos_agent","amount","mode","bank_name","is_deposited","creation","collection_datetime","receipt_image"]';
    url += '&limit_page_length=999&order_by=creation desc';

    console.log('🔗 Undeposited collections URL:', url);

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('❌ Fetch undeposited collections error:', text);
      throw new Error(`Failed to fetch collections: ${res.status} ${text || ''}`);
    }

    const json = await res.json();
    const rows: FOSCollectionResponse[] = json?.data || [];

    console.log('✅ Found undeposited collections for this login:', rows.length);
    return rows;
  } catch (error) {
    console.error('❌ Error fetching undeposited collections:', error);
    throw error;
  }
}

// 👉 NEW: get logged-in agent's FOS name (full_name on User)
export async function fetchLoggedInAgentName(): Promise<string> {
  // this reuses the internal helpers already defined above
  const email = await fetchLoggedInUserEmail();
  const fullName = await fetchUserFullName(email);

  console.log('👤 fetchLoggedInAgentName:', { email, fullName });

  // fallback to email if full_name is missing
  return fullName || email;
}


/**
 * Create a new FOS Cash Deposit
 */
export async function createCashDeposit(
  params: CreateDepositParams,
): Promise<FOSCashDepositResponse> {
  const {
    fos_agent,
    deposit_date,
    bank_name,
    branch,
    deposit_location,
    deposit_slip_no,
    selected_collections,
    deposit_slip_image,
  } = params;

  let depositName: string | null = null;

  try {
    const userEmail = await fetchLoggedInUserEmail();
    const fullName = await fetchUserFullName(userEmail);
    const csrfToken = await getCSRFToken();

    console.log('👤 User:', userEmail, fullName);
    console.log('🔑 CSRF Token:', csrfToken ? 'Found' : 'Missing');

    // 🔹 normalize / validate deposit_date
    const now = new Date();
    let normalizedDepositDate: string;

    const raw = (deposit_date || '').trim();

    if (!raw) {
      // no input → use today
      normalizedDepositDate = formatDateForErp(now); // YYYY-MM-DD
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      // already in YYYY-MM-DD
      normalizedDepositDate = raw;
    } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(raw)) {
      // support DD/MM/YYYY or DD-MM-YYYY → convert
      const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)!;
      const d = match[1].padStart(2, '0');
      const m = match[2].padStart(2, '0');
      const y = match[3];
      normalizedDepositDate = `${y}-${m}-${d}`; // YYYY-MM-DD
    } else {
      throw new Error(
        "Invalid Deposit Date. Please use format YYYY-MM-DD (e.g. 2025-11-24).",
      );
    }

    // Calculate total amount
    const totalAmount = selected_collections.reduce(
      (sum, col) => sum + col.amount,
      0,
    );

    const collectionItems: FOSCashDepositItem[] = selected_collections.map(
      col => ({
        collection: col.name,
        amount: col.amount,
      }),
    );

    const payload: FOSCashDepositPayload = {
      fos_agent: fos_agent || fullName,
      deposit_date: normalizedDepositDate,
      bank_name: bank_name || undefined,
      branch: branch || undefined,
      deposit_location: deposit_location || undefined,
      deposit_slip_no: deposit_slip_no || undefined,
      amount_deposited: totalAmount,
      collections: collectionItems,
    };

    console.log(
      '📤 Creating deposit with payload:',
      JSON.stringify(payload, null, 2),
    );

    const createRes = await fetch(ERP_FOS_DEPOSIT_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(payload),
    });

    console.log('📊 Create response status:', createRes.status);

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error('❌ Create deposit failed:', createRes.status, text);
      throw new Error(`Failed to create deposit: ${createRes.status} ${text || ''}`);
    }

    const createdJson = await createRes.json();
    console.log('✅ Deposit created:', createdJson);

    depositName = createdJson?.data?.name || '';

    if (!depositName) {
      throw new Error('Deposit created but no document name returned');
    }

    // Upload deposit slip image if provided
    if (deposit_slip_image && deposit_slip_image.uri) {
      console.log('📸 Uploading deposit slip image...');

      const formData = new FormData();
      formData.append('file', {
        uri: deposit_slip_image.uri,
        name: deposit_slip_image.fileName || `deposit-slip-${depositName}.jpg`,
        type: deposit_slip_image.type || 'image/jpeg',
      } as any);
      formData.append('doctype', 'FOS Cash Deposit');
      formData.append('docname', depositName);
      formData.append('fieldname', 'deposit_slip_image');
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
        console.error('❌ Upload failed:', text);
      } else {
        const uploadJson = await uploadRes.json();
        const fileUrl =
          uploadJson?.message?.file_url ||
          uploadJson?.file_url ||
          uploadJson?.message?.file_url;

        if (fileUrl) {
          console.log('✅ Image uploaded:', fileUrl);

          await fetch(depositDocUrl(depositName), {
            method: 'PUT',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-Frappe-CSRF-Token': csrfToken,
            },
            body: JSON.stringify({ deposit_slip_image: fileUrl }),
          });
        }
      }
    }

    // Update collections to mark as deposited
    console.log('🔄 Updating collections to is_deposited = 1...');

    for (const collection of selected_collections) {
      try {
        const collectionUrl = `${ERP_FOS_COLLECTION_URL}/${encodeURIComponent(
          collection.name,
        )}`;

        const updateRes = await fetch(collectionUrl, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({ is_deposited: 1 }),
        });

        if (updateRes.ok) {
          console.log(`✅ Marked ${collection.name} as deposited`);
        } else {
          const text = await updateRes.text();
          console.warn(`⚠️ Failed to mark ${collection.name}:`, text);
        }
      } catch (err) {
        console.warn(`⚠️ Error marking ${collection.name}:`, err);
      }
    }

    // Fetch the created deposit
    const fetchRes = await fetch(depositDocUrl(depositName), {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!fetchRes.ok) {
      throw new Error('Failed to fetch created deposit');
    }

    const fetchJson = await fetchRes.json();
    return fetchJson.data;
  } catch (error) {
    console.error('❌ Error in createCashDeposit:', error);

    if (depositName) {
      console.log('🔄 Rolling back deposit:', depositName);
      await deleteDepositDoc(depositName);
    }

    throw error;
  }
}

/**
 * Fetch all deposits for logged-in user
 */
export async function fetchMyDeposits(): Promise<FOSCashDepositResponse[]> {
  try {
    console.log('📡 Fetching deposits...');

    const userEmail = await fetchLoggedInUserEmail();
    const filters = JSON.stringify([['owner', '=', userEmail]]);

    let url = `${ERP_FOS_DEPOSIT_URL}?filters=${encodeURIComponent(filters)}`;
    url += `&fields=["*"]&limit_page_length=999`;
    url += `&order_by=creation desc`;

    console.log('🔗 Deposits URL:', url);

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('❌ Fetch deposits error:', text);
      throw new Error(`Failed to fetch deposits: ${res.status} ${text || ''}`);
    }

    const json = await res.json();
    const deposits = json?.data || [];

    console.log('✅ Found deposits:', deposits.length);

    return deposits;
  } catch (error) {
    console.error('❌ Error fetching deposits:', error);
    throw error;
  }
}

/**
 * Delete a deposit
 */
export async function deleteDeposit(name: string): Promise<void> {
  const csrfToken = await getCSRFToken();

  const res = await fetch(depositDocUrl(name), {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete deposit: ${res.status} ${text || ''}`);
  }
}
