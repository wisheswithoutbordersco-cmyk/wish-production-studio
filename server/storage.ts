// Supabase Storage helpers for independent Railway deployments.
// Files are uploaded to a public bucket and returned as public object URLs.

import { ENV } from "./_core/env";

const BUCKET_NAME = "production-studio";
let bucketReadyPromise: Promise<void> | undefined;

function getSupabaseConfig() {
  const supabaseUrl = ENV.supabaseUrl.replace(/\/+$/, "");
  const supabaseKey = ENV.supabaseKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Storage config missing: set SUPABASE_URL and SUPABASE_KEY",
    );
  }

  return { supabaseUrl, supabaseKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function encodeObjectPath(key: string): string {
  return key
    .split("/")
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join("/");
}

function buildPublicUrl(supabaseUrl: string, key: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${encodeObjectPath(key)}`;
}

async function ensurePublicBucket(): Promise<void> {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  const commonHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };

  const bucketResponse = await fetch(
    `${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`,
    { headers: commonHeaders },
  );

  if (bucketResponse.ok) {
    const bucket = (await bucketResponse.json()) as { public?: boolean };
    if (bucket.public) return;

    const updateResponse = await fetch(
      `${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`,
      {
        method: "PUT",
        headers: {
          ...commonHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({ public: true }),
      },
    );

    if (!updateResponse.ok) {
      const detail = await updateResponse
        .text()
        .catch(() => updateResponse.statusText);
      throw new Error(
        `Supabase bucket update failed (${updateResponse.status}): ${detail}`,
      );
    }
    return;
  }

  if (bucketResponse.status !== 404) {
    const detail = await bucketResponse
      .text()
      .catch(() => bucketResponse.statusText);
    throw new Error(
      `Supabase bucket lookup failed (${bucketResponse.status}): ${detail}`,
    );
  }

  const createResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: BUCKET_NAME,
      name: BUCKET_NAME,
      public: true,
      file_size_limit: null,
      allowed_mime_types: null,
    }),
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    const detail = await createResponse
      .text()
      .catch(() => createResponse.statusText);
    throw new Error(
      `Supabase bucket creation failed (${createResponse.status}): ${detail}`,
    );
  }
}

function ensureBucket(): Promise<void> {
  bucketReadyPromise ??= ensurePublicBucket().catch(error => {
    bucketReadyPromise = undefined;
    throw error;
  });
  return bucketReadyPromise;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  await ensureBucket();

  const key = appendHashSuffix(normalizeKey(relKey));
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${encodeObjectPath(key)}`;
  const body =
    typeof data === "string" ? data : Buffer.from(data as Uint8Array);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body,
  });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse
      .text()
      .catch(() => uploadResponse.statusText);
    throw new Error(
      `Supabase storage upload failed (${uploadResponse.status}): ${detail}`,
    );
  }

  return { key, url: buildPublicUrl(supabaseUrl, key) };
}

export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const { supabaseUrl } = getSupabaseConfig();
  const key = normalizeKey(relKey);
  return { key, url: buildPublicUrl(supabaseUrl, key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { url } = await storageGet(relKey);
  return url;
}
