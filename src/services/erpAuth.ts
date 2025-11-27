// src/services/erpAuth.ts

import { ERP_BASE_URL, ERP_LOGIN_PATH } from '../config/erpConfig';

export interface LoginResultBase {
  ok: boolean;
  statusCode: number | null;
  message: string;
  raw: unknown;
  fullName?: string;
}

export interface LoginSuccess extends LoginResultBase {
  ok: true;
  statusCode: number;
}

export interface LoginFailure extends LoginResultBase {
  ok: false;
}

export type LoginResult = LoginSuccess | LoginFailure;

/**
 * Login to ERPNext using username & password.
 * Sends POST to /api/method/login with form-encoded body (usr, pwd).
 */
export async function loginWithPassword(
  username: string,
  password: string,
): Promise<LoginResult> {
  const loginUrl = `${ERP_BASE_URL}${ERP_LOGIN_PATH}`;

  if (!username || !password) {
    return {
      ok: false,
      statusCode: null,
      message: 'Username and password are required.',
      raw: null,
    };
  }

  try {
    const body = `usr=${encodeURIComponent(username)}&pwd=${encodeURIComponent(
      password,
    )}`;

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    const text = await response.text();
    let json: any | null = null;

    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    const base: LoginResultBase = {
      ok: response.ok,
      statusCode: response.status,
      message: '',
      raw: json ?? text,
      fullName: json?.full_name,
    };

    if (response.ok) {
      return {
        ...base,
        ok: true,
        message:
          json?.message ||
          json?.full_name ||
          'Login successful. ERPNext session created.',
      };
    }

    // Error case
    const errorMsg =
      json?.message ||
      json?._server_messages ||
      text ||
      'Login failed. Please check your credentials.';

    return {
      ...base,
      ok: false,
      message: String(errorMsg),
    };
  } catch (err: any) {
    return {
      ok: false,
      statusCode: null,
      message: `Network / fetch error: ${err?.message || String(err)}`,
      raw: null,
    };
  }
}
