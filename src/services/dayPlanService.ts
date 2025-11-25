// src/services/dayPlanService.ts

import { ERP_BASE_URL } from '../config/erpConfig';

export interface DayPlanItem {
  name: string;
  case: string;
  customer: string;
  status: string;
}

export interface DayPlan {
  name: string;
  plan_date: string;
  agent: string;
  region: string;
  status: string;
  total_planned_amount: number;
  day_plan_items: DayPlanItem[];
}

// Fetch today's Day Plan for a given agent (by agent name)
// Returns null if no plan found
export async function fetchTodayDayPlanForAgent(
  agentName: string,
): Promise<DayPlan | null> {
  if (!agentName) return null;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = `${today.getMonth() + 1}`.padStart(2, '0');
  const dd = `${today.getDate()}`.padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD

  // filters = [["FOS Day Plan","agent","=",agentName],["FOS Day Plan","plan_date","=",todayStr]]
  const filters = encodeURIComponent(
    JSON.stringify([
      ['FOS Day Plan', 'agent', '=', agentName],
      ['FOS Day Plan', 'plan_date', '=', todayStr],
    ]),
  );

  // get one matching day plan for today
  const listUrl = `${ERP_BASE_URL}/api/resource/FOS%20Day%20Plan?filters=${filters}&fields=["name"]&limit_page_length=1`;

  const listRes = await fetch(listUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include' as RequestCredentials,
  });

  if (!listRes.ok) {
    throw new Error('Failed to fetch day plan list');
  }

  const listJson = await listRes.json();
  const rows = listJson.data || [];
  if (!rows.length) {
    return null; // no plan for today
  }

  const dayPlanName = rows[0].name as string;

  // Get full day plan with child table
  const detailUrl = `${ERP_BASE_URL}/api/resource/FOS%20Day%20Plan/${encodeURIComponent(
    dayPlanName,
  )}`;

  const detailRes = await fetch(detailUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include' as RequestCredentials,
  });

  if (!detailRes.ok) {
    throw new Error('Failed to fetch day plan details');
  }

  const detailJson = await detailRes.json();
  const data = detailJson.data;

  const items: DayPlanItem[] = (data.day_plan_items || []).map((row: any) => ({
    name: row.name,
    case: row.case,
    customer: row.customer,
    status: row.status,
  }));

  const plan: DayPlan = {
    name: data.name,
    plan_date: data.plan_date,
    agent: data.agent,
    region: data.region,
    status: data.status,
    total_planned_amount: data.total_planned_amount,
    day_plan_items: items,
  };

  return plan;
}
