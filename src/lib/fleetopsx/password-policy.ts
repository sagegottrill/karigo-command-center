/** Brief stash of the password used at login when a forced reset is required. */
const PENDING_LOGIN_PASSWORD_KEY = "fleetopsx_pending_login_password";

/** Well-known defaults issued when admins create accounts without a custom password. */
export const FORBIDDEN_DEFAULT_PASSWORDS = ["ChangeMe@2026"] as const;

export function stashPendingLoginPassword(password: string) {
  if (typeof window === "undefined") return;
  const value = password.trim();
  if (!value) return;
  sessionStorage.setItem(PENDING_LOGIN_PASSWORD_KEY, value);
}

export function clearPendingLoginPassword() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_LOGIN_PASSWORD_KEY);
}

export function getPendingLoginPassword(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PENDING_LOGIN_PASSWORD_KEY);
}

/**
 * New password must differ from the temp/default password the user just signed in with.
 * Throws an Error with a user-facing message when invalid.
 */
export function assertNewPasswordAllowed(newPassword: string) {
  const next = newPassword.trim();
  if (next.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const pending = getPendingLoginPassword();
  if (pending && next === pending) {
    throw new Error("Choose a different password — you cannot reuse your temporary or default password.");
  }

  for (const forbidden of FORBIDDEN_DEFAULT_PASSWORDS) {
    if (next === forbidden) {
      throw new Error("Choose a different password — you cannot reuse the system default password.");
    }
  }
}
