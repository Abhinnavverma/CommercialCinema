export const ERROR_MESSAGES = {
  AGE_GROUP_REQUIRED: "ageGroup is required",
  SESSION_ID_REQUIRED: "sessionId is required",
  PATRON_NOT_FOUND: "Patron not found",
  ADMIN_CREDENTIALS_REQUIRED: "email and password are required",
  INVALID_ADMIN_CREDENTIALS: "Invalid admin credentials",
  FAILED_CREATE_PATRON: "Failed to create patron",
  duplicateSession: (sessionId: string) => `Session already exists: ${sessionId}`,
} as const;
