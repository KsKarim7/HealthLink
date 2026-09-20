import { STORAGE_KEYS } from "./constants";

export interface AuthUser {
  id: string;
  username: string;
  role: "doctor" | "receptionist";
  /**
   * Which `operators` row this demo login records visits as. Phase 2 replaces
   * the demo login with a shared login plus an operator picker; until then each
   * seeded user maps to a seeded operator so `recorded_by` is a real value.
   */
  operatorId: number;
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEYS.auth);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    // Sessions stored before operators existed have no operatorId — treat them
    // as stale so the user signs in again and gets a usable one.
    if (!parsed || typeof parsed.operatorId !== "number") return null;
    return parsed as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthUser(user: AuthUser): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEYS.auth, JSON.stringify(user));
  }
}

export function clearAuthUser(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEYS.auth);
  }
}

export const SEED_USERS = [
  {
    id: "doctor-1",
    username: "doctor",
    password: "doctor123",
    role: "doctor" as const,
    operatorId: 2, // "Dr. Rahman"
  },
  {
    id: "receptionist-1",
    username: "receptionist",
    password: "receptionist123",
    role: "receptionist" as const,
    operatorId: 1, // "Reception Desk"
  },
];

export function login(username: string, password: string): AuthUser | null {
  const user = SEED_USERS.find((u) => u.username === username && u.password === password);
  if (!user) return null;
  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    operatorId: user.operatorId,
  };
  setAuthUser(authUser);
  return authUser;
}
