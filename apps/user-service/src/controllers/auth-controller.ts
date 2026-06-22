import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JwtPayload, User } from "@commerical-cinema/schema";
import {
  ADMIN_SUBJECT,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  HTTP_STATUS,
  ROLES,
} from "@commerical-cinema/core";
import { DuplicateSessionError, UserService } from "../services/user-service.js";
import { ERROR_MESSAGES } from "../static/index.js";

type AuthControllerDeps = {
  app: FastifyInstance;
  userService: UserService;
};

function patronResponse(token: string, user: User) {
  return {
    token,
    user: {
      id: user.id,
      role: ROLES.PATRON,
      sessionId: user.sessionId,
      ageGroup: user.ageGroup,
    },
  };
}

export function createAuthController(deps: AuthControllerDeps) {
  const { app, userService } = deps;
  const adminEmail = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;

  function signPatronToken(user: User): string {
    return app.jwt.sign({
      sub: user.id,
      role: ROLES.PATRON,
      sessionId: user.sessionId,
    } satisfies JwtPayload);
  }

  return {
    async signup(
      request: FastifyRequest<{ Body: { ageGroup?: string; sessionId?: string } }>,
      reply: FastifyReply,
    ) {
      const { ageGroup, sessionId } = request.body ?? {};

      if (!ageGroup || typeof ageGroup !== "string" || ageGroup.trim().length === 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.AGE_GROUP_REQUIRED });
      }

      try {
        const user = await userService.createPatron({ ageGroup: ageGroup.trim(), sessionId });
        return patronResponse(signPatronToken(user), user);
      } catch (error) {
        if (error instanceof DuplicateSessionError) {
          return reply.status(HTTP_STATUS.CONFLICT).send({ error: error.message });
        }
        throw error;
      }
    },

    async login(
      request: FastifyRequest<{ Body: { sessionId?: string } }>,
      reply: FastifyReply,
    ) {
      const { sessionId } = request.body ?? {};

      if (!sessionId || typeof sessionId !== "string" || sessionId.trim().length === 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.SESSION_ID_REQUIRED });
      }

      const user = await userService.findPatronBySessionId(sessionId.trim());
      if (!user) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.PATRON_NOT_FOUND });
      }

      return patronResponse(signPatronToken(user), user);
    },

    async adminLogin(
      request: FastifyRequest<{ Body: { email?: string; password?: string } }>,
      reply: FastifyReply,
    ) {
      const { email, password } = request.body ?? {};

      if (!email || !password) {
        return reply
          .status(HTTP_STATUS.BAD_REQUEST)
          .send({ error: ERROR_MESSAGES.ADMIN_CREDENTIALS_REQUIRED });
      }

      if (email !== adminEmail || password !== adminPassword) {
        return reply
          .status(HTTP_STATUS.UNAUTHORIZED)
          .send({ error: ERROR_MESSAGES.INVALID_ADMIN_CREDENTIALS });
      }

      const token = app.jwt.sign({
        sub: ADMIN_SUBJECT,
        role: ROLES.ADMIN,
      } satisfies JwtPayload);

      return {
        token,
        user: {
          id: ADMIN_SUBJECT,
          role: ROLES.ADMIN,
        },
      };
    },

    async me(request: FastifyRequest, reply: FastifyReply) {
      const claims = request.user;

      if (claims.role === ROLES.ADMIN) {
        return {
          user: {
            id: claims.sub,
            role: ROLES.ADMIN,
          },
        };
      }

      const user = await userService.findPatronById(claims.sub);
      if (!user) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.PATRON_NOT_FOUND });
      }

      return {
        user: {
          id: user.id,
          role: ROLES.PATRON,
          sessionId: user.sessionId,
          ageGroup: user.ageGroup,
        },
      };
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
