import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { createOwnerGate } from "./ownerGate";

async function withTestServer(
  password: string | undefined,
  run: (baseUrl: string, reachedApplication: () => number) => Promise<void>
) {
  const app = express();
  let applicationRequests = 0;

  app.use(createOwnerGate(() => password));
  app.use(express.json());
  app.all("*", (req, res) => {
    applicationRequests += 1;
    res.json({ ok: true, path: req.path, body: req.body });
  });

  const server: Server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl, () => applicationRequests);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

describe("owner access gate", () => {
  it("fails closed when no password is configured", async () => {
    await withTestServer(undefined, async (baseUrl, reachedApplication) => {
      const response = await fetch(`${baseUrl}/api/generate/quick-create`, {
        method: "POST",
      });

      expect(response.status).toBe(503);
      expect(await response.text()).toContain(
        "Set OWNER_PASSWORD or APP_PASSWORD"
      );
      expect(reachedApplication()).toBe(0);
    });
  });

  it("blocks API, generator, and ordinary page routes before application handlers", async () => {
    await withTestServer(
      "private-test-password",
      async (baseUrl, reachedApplication) => {
        const apiResponse = await fetch(
          `${baseUrl}/api/generate/quick-create`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "must not be processed" }),
          }
        );
        const uploadResponse = await fetch(`${baseUrl}/api/upload-image`, {
          method: "POST",
        });
        const pageResponse = await fetch(`${baseUrl}/private/page`);

        expect(apiResponse.status).toBe(401);
        expect(await apiResponse.json()).toEqual({
          error: "Owner access required",
        });
        expect(uploadResponse.status).toBe(401);
        expect(pageResponse.status).toBe(401);
        expect(await pageResponse.text()).toContain('name="password"');
        expect(reachedApplication()).toBe(0);
      }
    );
  });

  it("rejects a wrong password and unlocks requests only with its signed cookie", async () => {
    await withTestServer(
      "private-test-password",
      async (baseUrl, reachedApplication) => {
        const wrongPassword = await fetch(`${baseUrl}/__owner/login`, {
          method: "POST",
          body: new URLSearchParams({ password: "wrong" }),
        });
        expect(wrongPassword.status).toBe(401);
        expect(await wrongPassword.text()).toContain("Incorrect password");
        expect(wrongPassword.headers.get("set-cookie")).toBeNull();

        const loginResponse = await fetch(`${baseUrl}/__owner/login`, {
          method: "POST",
          headers: { "x-forwarded-proto": "https" },
          body: new URLSearchParams({ password: "private-test-password" }),
          redirect: "manual",
        });
        expect(loginResponse.status).toBe(303);
        expect(loginResponse.headers.get("location")).toBe("/");

        const setCookie = loginResponse.headers.get("set-cookie");
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("Secure");
        expect(setCookie).toContain("SameSite=Lax");
        const cookie = setCookie!.split(";", 1)[0];

        const allowed = await fetch(`${baseUrl}/api/generate/quick-create`, {
          headers: { cookie },
        });
        expect(allowed.status).toBe(200);
        expect(await allowed.json()).toMatchObject({
          ok: true,
          path: "/api/generate/quick-create",
        });
        expect(reachedApplication()).toBe(1);

        const [cookieName, cookieValue] = cookie.split("=");
        const [expiresAt, signature] = cookieValue.split(".");
        const changedFirstByte = signature[0] === "A" ? "B" : "A";
        const tamperedCookie = `${cookieName}=${expiresAt}.${changedFirstByte}${signature.slice(1)}`;
        const denied = await fetch(`${baseUrl}/api/upload-image`, {
          headers: { cookie: tamperedCookie },
        });
        expect(denied.status).toBe(401);
        expect(reachedApplication()).toBe(1);
      }
    );
  });
});
