import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const firebaseProjectId = "partx-production";
const firebaseWebApiKey = process.env.FIREBASE_WEB_API_KEY ?? "AIzaSyDl38pRlgpMCqaeKe5gSj8263FSGS9z-UQ";
const productIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

type FirestoreValue = {
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

export async function POST(request: Request) {
  try {
    const session = await requireSeller(request);
    const body = await readJson(request);
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productIdPattern.test(productId)) return error("A valid product ID is required.", 400);

    const config = cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `partx/products/${session.uid}/${productId}/primary-${crypto.randomUUID()}`;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
    const parameters: Record<string, string | number> = {
      public_id: publicId,
      timestamp,
      ...(uploadPreset ? { upload_preset: uploadPreset } : {}),
    };

    return NextResponse.json({
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      signature: signCloudinary(parameters, config.apiSecret),
      ...parameters,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (reason) {
    return routeError(reason);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSeller(request);
    const body = await readJson(request);
    const publicId = typeof body.publicId === "string" ? body.publicId.trim() : "";
    if (!publicId.startsWith(`partx/products/${session.uid}/`)) return error("This image does not belong to your store.", 403);

    const config = cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const parameters = { public_id: publicId, timestamp };
    const form = new FormData();
    form.set("public_id", publicId);
    form.set("timestamp", String(timestamp));
    form.set("api_key", config.apiKey);
    form.set("signature", signCloudinary(parameters, config.apiSecret));

    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    if (!response.ok) throw new UploadRouteError("The previous product image could not be removed.", 502);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (reason) {
    return routeError(reason);
  }
}

async function requireSeller(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new UploadRouteError("Sign in as a seller to upload images.", 401);

  const identityResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseWebApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
    cache: "no-store",
  });
  const identity = await identityResponse.json() as { users?: Array<{ localId?: string }> };
  const uid = identity.users?.[0]?.localId;
  if (!identityResponse.ok || !uid) throw new UploadRouteError("Your seller session expired. Sign in again and retry.", 401);

  const profileResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const profile = await profileResponse.json() as FirestoreDocument;
  const roles = profile.fields?.roles?.arrayValue?.values?.map((role) => role.stringValue).filter(Boolean) ?? [];
  if (!profileResponse.ok || !roles.includes("seller")) {
    throw new UploadRouteError("Only PartX seller accounts can upload product images.", 403);
  }
  return { uid };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    throw new UploadRouteError("The upload request is invalid.", 400);
  }
}

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new UploadRouteError("Product image storage is not configured. Add the Cloudinary environment variables in Vercel and redeploy.", 503);
  }
  return { cloudName, apiKey, apiSecret };
}

function signCloudinary(parameters: Record<string, string | number>, apiSecret: string) {
  const payload = Object.entries(parameters)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function routeError(reason: unknown) {
  if (reason instanceof UploadRouteError) return error(reason.message, reason.status);
  return error("Image storage is temporarily unavailable. Please try again.", 500);
}

class UploadRouteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
