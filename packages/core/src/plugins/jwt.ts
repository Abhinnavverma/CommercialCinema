import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyJwt from "@fastify/jwt";
import type { JwtPayload, UserRole } from "@commerical-cinema/schema";
import {
  COMMON_ERRORS,
  DEFAULT_JWT_EXPIRES_IN,
  DEFAULT_JWT_SECRET,
  HTTP_STATUS,
} from "../static/index.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: UserRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerJwt(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN ?? DEFAULT_JWT_EXPIRES_IN;

  await app.register(fastifyJwt, { secret, sign: { expiresIn } });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({ error: COMMON_ERRORS.UNAUTHORIZED });
    }
  });

  app.decorate("requireRole", (role: UserRole) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.user.role !== role) {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({ error: COMMON_ERRORS.FORBIDDEN });
      }
    };
  });
}
