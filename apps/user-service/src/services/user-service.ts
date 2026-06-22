import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { users, type Db, type User } from "@commerical-cinema/schema";
import { PG_ERROR_CODES } from "@commerical-cinema/core";
import { ERROR_MESSAGES } from "../static/index.js";

export class DuplicateSessionError extends Error {
  constructor(sessionId: string) {
    super(ERROR_MESSAGES.duplicateSession(sessionId));
    this.name = "DuplicateSessionError";
  }
}

export class UserService {
  constructor(private readonly db: Db) {}

  async createPatron(input: { ageGroup: string; sessionId?: string }): Promise<User> {
    const sessionId = input.sessionId ?? randomUUID();

    try {
      const [user] = await this.db
        .insert(users)
        .values({ sessionId, ageGroup: input.ageGroup })
        .returning();

      if (!user) {
        throw new Error(ERROR_MESSAGES.FAILED_CREATE_PATRON);
      }

      return user;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateSessionError(sessionId);
      }
      throw error;
    }
  }

  async findPatronBySessionId(sessionId: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.sessionId, sessionId)).limit(1);
    return user ?? null;
  }

  async findPatronById(id: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === PG_ERROR_CODES.UNIQUE_VIOLATION
  );
}
