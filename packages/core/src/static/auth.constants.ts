export const ROLES = {
  PATRON: "patron",
  ADMIN: "admin",
} as const;

export const ADMIN_SUBJECT = "admin";

export const DEFAULT_ADMIN_EMAIL = "admin@apexflo.local";
export const DEFAULT_ADMIN_PASSWORD = "admin123";

export const DEFAULT_JWT_SECRET = "dev-secret-change-me";
export const DEFAULT_JWT_EXPIRES_IN = "3h";
