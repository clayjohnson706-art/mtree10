import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "mtree_session_token";

// In-memory token cache — avoids hitting native SecureStore on every single api() call.
// Without this, rapid navigation (quick tab switches, opening Settings, etc.) fires many
// concurrent screens' focus-effect fetches at once, each independently calling getToken(),
// which under load can occasionally hit a TRANSIENT native SecureStore read glitch on Android
// (storage.secureGet() swallows the error and silently returns null per its documented
// contract) — indistinguishable from "genuinely signed out". AuthContext.refresh() then took
// that at face value with zero retry and logged the user out, which is exactly the "quick
// navigation -> kicked to login" bug. Caching the token after the first successful read means
// every subsequent call (however many fire concurrently) reads the in-memory value instead of
// racing native storage — the glitch can only ever happen once, on the very first read, which
// is additionally retried once below before being trusted.
let cachedToken: string | null | undefined = undefined; // undefined = not loaded yet this session
let inFlightRead: Promise<string | null> | null = null;

async function readTokenFromStorage(): Promise<string | null> {
  const first = await storage.secureGet(TOKEN_KEY, null);
  if (first !== null) return first;
  // A null on this very first read is ambiguous — genuine "no token" (fresh install / already
  // signed out) or a one-off native storage glitch. Re-check once after a beat before trusting it.
  await new Promise((r) => setTimeout(r, 250));
  return await storage.secureGet(TOKEN_KEY, null);
}

export async function saveToken(token: string) {
  cachedToken = token;
  await storage.secureSet(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  if (!inFlightRead) {
    inFlightRead = readTokenFromStorage().then((v) => {
      cachedToken = v;
      inFlightRead = null;
      return v;
    });
  }
  return inFlightRead;
}

export async function clearToken() {
  cachedToken = null;
  await storage.secureRemove(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`API ${res.status}: ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}
