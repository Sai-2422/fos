// src/services/myCasesService.ts

import { Asset } from 'react-native-image-picker';
import {
  ERP_FOS_CASE_URL,
  ERP_FOS_VISIT_KYC_URL,
  ERP_SET_VALUE_URL,
  ERP_UPLOAD_FILE_URL,
} from '../config/erpConfig';

// Status options for FOS Case.status field
// (update this array if you add more statuses in ERPNext)
export const CASE_STATUS_OPTIONS: string[] = [
  'Open',
  'Visit Planned',
  'Pending',
  'Closed',
];

// Outcome Type options – keep in sync with FOS Case.outcome_type select
export const OUTCOME_TYPE_OPTIONS: string[] = [
  'Completed',
  'Reschedule',
  'No Response',
  'Customer Not on Location',
];

export type KycDocument = {
  name: string;
  documentType: string;
  documentNo: string;
  frontImage?: string | null;
  backImage?: string | null;
};

// Shape we will use inside the UI
export type AgentCase = {
  id: string; // FOS Case name (CASE-00001 / GL-...)
  caseId: string; // same as id, kept for clarity in UI
  customer: string; // fos_customer
  agent: string; // agent
  status: string; // status
  overdueAmount: number; // overdue_amt
  pendingAmount: number; // pending_amount  ✅ NEW
  dpd: number; // dpd
  address: string; // current_address

  priority?: string | null; // High / Low / etc.

  // Type of Visit / product_type
  typeOfVisit?: string | null; // our internal naming
  productType?: string | null; // camel-case mirror of product_type

  visitDate?: string | null; // visit_date
  outcomeType?: string | null; // outcome_type
  rescheduleDate?: string | null; // reschedule_date
  visitSelfie?: string | null; // visit_selfie

  // For now we don’t load existing KYC rows in list view,
  // but we keep this field for future extensions.
  kycDocuments?: KycDocument[];
};

type OutcomeUpdatePayload = {
  outcomeType?: string;
  visitDate?: string;
  rescheduleDate?: string;
};

/**
 * Internal helper: update one or more fields on FOS Case via frappe.client.set_value
 */
async function setCaseFields(
  caseName: string,
  fields: Record<string, any>,
): Promise<void> {
  if (!caseName) {
    throw new Error('Case id is required.');
  }

  if (!fields || Object.keys(fields).length === 0) {
    return;
  }

  const res = await fetch(ERP_SET_VALUE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      doctype: 'FOS Case',
      name: caseName,
      // In frappe.client.set_value, fieldname can be a dict
      fieldname: fields,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update FOS Case: ${res.status} ${text || ''}`);
  }
}

/**
 * Load all FOS Cases where `agent` = given agentName.
 * This uses FOS Case directly (no Day Plan).
 */
export async function fetchCasesForAgent(
  agentName: string,
): Promise<AgentCase[]> {
  if (!agentName) {
    throw new Error('Agent name is required to fetch cases.');
  }

  const params = new URLSearchParams();
  params.set(
    'fields',
    JSON.stringify([
      'name',
      'fos_customer',
      'agent',
      'status',
      'overdue_amt',
      'pending_amount', // ✅ NEW – to show Pending Amount
      'dpd',
      'current_address',
      'priority',
      'product_type', // ⬅️ Type of Visit (Payment / KYC)
      'visit_date',
      'outcome_type',
      'reschedule_date',
      'visit_selfie',
    ]),
  );
  params.set(
    'filters',
    JSON.stringify([['FOS Case', 'agent', '=', agentName]]),
  );
  // Adjust limit if you expect more than 500–1000 cases per agent
  params.set('limit_page_length', '1000');

  const url = `${ERP_FOS_CASE_URL}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include', // important for ERPNext session cookies
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch cases: ${res.status} ${text || ''}`);
  }

  const json = await res.json();
  const rows = (json && json.data) || [];

  return rows.map((row: any) => ({
    id: row.name,
    caseId: row.name,
    customer: row.fos_customer || '',
    agent: row.agent || '',
    status: row.status || '',
    overdueAmount:
      typeof row.overdue_amt === 'number'
        ? row.overdue_amt
        : Number(row.overdue_amt || 0),

    // ✅ Map ERP pending_amount → pendingAmount
    pendingAmount:
      typeof row.pending_amount === 'number'
        ? row.pending_amount
        : Number(row.pending_amount || 0),

    dpd: typeof row.dpd === 'number' ? row.dpd : Number(row.dpd || 0),
    address: row.current_address || '',
    priority: row.priority || null,

    // Map product_type into our Type of Visit fields
    typeOfVisit: row.product_type || null,
    productType: row.product_type || null,

    visitDate: row.visit_date || null,
    outcomeType: row.outcome_type || null,
    rescheduleDate: row.reschedule_date || null,
    visitSelfie: row.visit_selfie || null,

    // Existing KYC rows are not loaded yet (we can extend later)
    kycDocuments: [],
  }));
}

/**
 * Update FOS Case.status
 */
export async function updateCaseStatus(
  caseName: string,
  newStatus: string,
): Promise<void> {
  await setCaseFields(caseName, { status: newStatus });
}

/**
 * Update outcome-related fields on FOS Case:
 * outcome_type, visit_date, reschedule_date
 */
export async function updateCaseOutcome(
  caseName: string,
  payload: OutcomeUpdatePayload,
): Promise<void> {
  const fields: Record<string, any> = {};

  if (typeof payload.outcomeType !== 'undefined') {
    fields.outcome_type = payload.outcomeType || '';
  }
  if (typeof payload.visitDate !== 'undefined') {
    fields.visit_date = payload.visitDate || '';
  }
  if (typeof payload.rescheduleDate !== 'undefined') {
    fields.reschedule_date = payload.rescheduleDate || '';
  }

  await setCaseFields(caseName, fields);
}

/**
 * Upload a file to ERPNext via /api/method/upload_file
 * and return the file_url.
 */
async function uploadErpFile(asset: Asset): Promise<string> {
  if (!asset || !asset.uri) {
    throw new Error('Invalid image selection.');
  }

  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    type: asset.type || 'image/jpeg',
    name: asset.fileName || 'image.jpg',
  } as any);

  // Mark as private (same as you do for other uploads)
  formData.append('is_private', '1');

  const res = await fetch(ERP_UPLOAD_FILE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`File upload failed: ${res.status} ${text || ''}`);
  }

  const json = await res.json();
  const fileUrl = json?.message?.file_url;

  if (!fileUrl) {
    throw new Error('Upload succeeded but file_url is missing.');
  }

  return fileUrl as string;
}

/**
 * Upload a visit selfie and set visit_selfie on FOS Case
 */
export async function uploadCaseSelfie(
  caseName: string,
  asset: Asset,
): Promise<string> {
  const fileUrl = await uploadErpFile(asset);
  await setCaseFields(caseName, { visit_selfie: fileUrl });
  return fileUrl;
}

type KycImagesPayload = {
  documentType: string;
  documentNo: string;
  frontAsset?: Asset;
  backAsset?: Asset;
};

/**
 * Create a FOS Visit KYC row for given Case, uploading images if provided.
 */
export async function createKycDocumentWithImages(
  caseName: string,
  payload: KycImagesPayload,
): Promise<void> {
  if (!payload.documentType || !payload.documentNo) {
    throw new Error('Document Type and Document Number are required for KYC.');
  }

  let frontUrl: string | undefined;
  let backUrl: string | undefined;

  if (payload.frontAsset) {
    frontUrl = await uploadErpFile(payload.frontAsset);
  }
  if (payload.backAsset) {
    backUrl = await uploadErpFile(payload.backAsset);
  }

  const body: any = {
    data: {
      parent: caseName,
      parenttype: 'FOS Case',
      parentfield: 'kyc_document',
      document_type: payload.documentType,
      document_no: payload.documentNo,
    },
  };

  if (frontUrl) {
    body.data.front_image = frontUrl;
  }
  if (backUrl) {
    body.data.back_image = backUrl;
  }

  const res = await fetch(ERP_FOS_VISIT_KYC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create KYC row: ${res.status} ${text || ''}`);
  }
}
