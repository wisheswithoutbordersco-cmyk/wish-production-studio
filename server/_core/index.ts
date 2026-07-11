import "dotenv/config";
import express from "express";
import { createServer } from "http";
import {
  createExpressMiddleware,
  type CreateExpressContextOptions,
} from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";
import { generationRouter } from "../generationRoutes";

function isOAuthConfigured(): boolean {
  return Boolean(ENV.oAuthServerUrl && ENV.appId && ENV.cookieSecret);
}

async function createRequestContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  if (!isOAuthConfigured()) {
    return {
      req: opts.req,
      res: opts.res,
      user: null,
    };
  }

  const { createContext } = await import("./context");
  return createContext(opts);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  // Retained for compatibility but inactive unless OAuth variables are present.
  registerOAuthRoutes(app);

  // Generation job routes are deliberately public.
  app.use(generationRouter);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: createRequestContext,
    }),
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number.parseInt(process.env.PORT || "3000", 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch(error => {
  console.error("Failed to start server:", error);
  process.exitCode = 1;
});
