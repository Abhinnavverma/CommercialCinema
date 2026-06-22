import type { FastifyInstance } from "fastify";
import type { AuthController } from "../controllers/auth-controller.js";

type AuthRoutesOptions = {
  authController: AuthController;
};

export async function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions) {
  const { authController } = options;

  app.post("/auth/signup", authController.signup);
  app.post("/auth/login", authController.login);
  app.post("/auth/admin/login", authController.adminLogin);
  app.get("/auth/me", { preHandler: [app.authenticate] }, authController.me);
}
