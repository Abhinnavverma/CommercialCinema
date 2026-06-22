import { apiRequest } from "./client.js";

export type AuthUser = {
  id: string;
  role: "patron" | "admin";
  sessionId?: string;
  ageGroup?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export function patronSignup(sessionId: string, ageGroup = "adult"): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/signup", {
    method: "POST",
    body: { sessionId, ageGroup },
  });
}

export function patronLogin(sessionId: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: { sessionId },
  });
}

export function adminLogin(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/admin/login", {
    method: "POST",
    body: { email, password },
  });
}

export type MeResponse = {
  user: AuthUser;
};

export function fetchMe(token: string): Promise<MeResponse> {
  return apiRequest<MeResponse>("/auth/me", { token });
}
