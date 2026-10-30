import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import express, {
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { parse as parseCookies } from "cookie";

const SESSION_COOKIE = "wish_owner_session";
const LOGIN_PATH = "/__owner/login";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const parseLoginForm = express.urlencoded({
  extended: false,
  limit: "4kb",
});

function getConfiguredPassword(): string | undefined {
  const password = process.env.OWNER_PASSWORD || process.env.APP_PASSWORD;
  return password && password.trim().length > 0 ? password : undefined;
}

function passwordMatches(expected: string, supplied: string): boolean {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

function signSession(expiresAt: number, password: string): string {
  return createHmac("sha256", password)
    .update(`wish-production-studio-owner-session:v1:${expiresAt}`)
    .digest("base64url");
}

function hasValidSession(req: Request, password: string): boolean {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return false;

  let session: string | undefined;
  try {
    session = parseCookies(cookieHeader)[SESSION_COOKIE];
  } catch {
    return false;
  }
  if (!session) return false;

  const [expiresAtText, suppliedSignature, ...extraParts] = session.split(".");
  if (
    extraParts.length > 0 ||
    !/^\d+$/.test(expiresAtText) ||
    !suppliedSignature
  ) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + SESSION_TTL_SECONDS + 60
  ) {
    return false;
  }

  const expectedSignature = Buffer.from(
    signSession(expiresAt, password),
    "base64url"
  );
  const providedSignature = Buffer.from(suppliedSignature, "base64url");
  return (
    providedSignature.length === expectedSignature.length &&
    timingSafeEqual(expectedSignature, providedSignature)
  );
}

function applySecurityHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendLoginPage(res: Response, hasError: boolean): void {
  const errorMessage = hasError
    ? '<p class="error" role="alert">Incorrect password. Please try again.</p>'
    : "";
  res
    .status(401)
    .setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    );
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Private access</title>
  <style>
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #090b10; color: #f3f4f6; font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(100%, 360px); padding: 30px; border: 1px solid #252a35; border-radius: 14px; background: #10131a; box-shadow: 0 24px 70px #0008; }
    h1 { margin: 0 0 6px; font-size: 20px; font-weight: 600; letter-spacing: -.02em; }
    p { margin: 0 0 20px; color: #9ca3af; font-size: 14px; }
    label { display: block; margin: 0 0 7px; color: #c4c9d3; font-size: 13px; }
    input { width: 100%; min-height: 46px; padding: 10px 12px; border: 1px solid #343b49; border-radius: 8px; background: #090b10; color: #f9fafb; font: inherit; outline: none; }
    input:focus { border-color: #9ba9c2; box-shadow: 0 0 0 3px #9ba9c222; }
    button { width: 100%; min-height: 44px; margin-top: 14px; border: 0; border-radius: 8px; background: #e5e7eb; color: #111318; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #fff; }
    .error { margin: 12px 0 0; color: #fca5a5; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <h1>Private access</h1>
    <p>Enter your password to continue.</p>
    <form method="post" action="${LOGIN_PATH}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Continue</button>
      ${errorMessage}
    </form>
  </main>
</body>
</html>`);
}

function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

function isSecureRequest(req: Request): boolean {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0].trim();
  return req.secure || forwardedProto === "https";
}

/**
 * Creates a global owner gate. Install this before body parsers, routes, Vite,
 * and static-file serving so no application endpoint can bypass the password.
 */
export function createOwnerGate(
  readPassword: () => string | undefined = getConfiguredPassword
): RequestHandler {
  return (req, res, next) => {
    applySecurityHeaders(res);
    const password = readPassword();
    if (!password) {
      res
        .status(503)
        .type("text/plain")
        .send(
          "Owner access is not configured. Set OWNER_PASSWORD or APP_PASSWORD."
        );
      return;
    }

    if (hasValidSession(req, password)) {
      next();
      return;
    }

    if (req.method === "POST" && req.path === LOGIN_PATH) {
      parseLoginForm(req, res, error => {
        if (error) {
          res.status(400).type("text/plain").send("Invalid login request.");
          return;
        }

        const suppliedPassword =
          typeof req.body?.password === "string" ? req.body.password : "";
        if (!passwordMatches(password, suppliedPassword)) {
          sendLoginPage(res, true);
          return;
        }

        const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
        const secure = isSecureRequest(req);
        const sessionValue = `${expiresAt}.${signSession(expiresAt, password)}`;
        const expires = new Date(expiresAt * 1000).toUTCString();
        res.setHeader(
          "Set-Cookie",
          `${SESSION_COOKIE}=${sessionValue}; Max-Age=${SESSION_TTL_SECONDS}; Expires=${expires}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
        );
        res.redirect(303, "/");
      });
      return;
    }

    if (isApiPath(req.path)) {
      res.status(401).json({ error: "Owner access required" });
      return;
    }

    sendLoginPage(res, false);
  };
}

export const ownerGate = createOwnerGate();
