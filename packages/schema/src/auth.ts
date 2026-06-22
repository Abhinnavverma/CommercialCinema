export type UserRole = "patron" | "admin";

export type JwtPayload = {
  sub: string;
  role: UserRole;
  sessionId?: string;
  ageGroup?: string;
};
