export interface StoredUser {
  sub: string;
  name: string;
}

export const ACCESS_TOKEN_STORAGE_KEY = "tang_agent_access_token";
export const USER_STORAGE_KEY = "tang_agent_user";

export function getStoredAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredUser>;
    if (typeof parsed.sub !== "string" || typeof parsed.name !== "string") return null;
    return { sub: parsed.sub, name: parsed.name };
  } catch {
    return null;
  }
}

export function storeAuthSession(accessToken: string, user: StoredUser) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
}
