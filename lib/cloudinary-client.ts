import { firebaseAuth } from "@/lib/firebase";

type SignedUpload = {
  cloudName: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  public_id: string;
  upload_preset?: string;
};

type CloudinaryUploadResult = {
  secure_url?: string;
  public_id?: string;
  error?: { message?: string };
};

export type UploadedProductImage = {
  imageUrl: string;
  imagePublicId: string;
};

export async function uploadProductImageToCloudinary(
  productId: string,
  image: File,
  onProgress?: (progress: number) => void,
): Promise<UploadedProductImage> {
  const token = await sellerToken();
  const signedResponse = await fetch("/api/uploads/cloudinary", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  const signedBody = await signedResponse.json() as SignedUpload & { error?: string };
  if (!signedResponse.ok) throw new Error(signedBody.error ?? "PartX could not prepare the image upload.");

  const form = new FormData();
  form.set("file", image);
  form.set("api_key", signedBody.apiKey);
  form.set("timestamp", String(signedBody.timestamp));
  form.set("signature", signedBody.signature);
  form.set("public_id", signedBody.public_id);
  if (signedBody.upload_preset) form.set("upload_preset", signedBody.upload_preset);

  const result = await sendUpload(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signedBody.cloudName)}/image/upload`,
    form,
    onProgress,
  );
  if (!result.secure_url || !result.public_id) throw new Error(result.error?.message ?? "Cloudinary did not return an image URL.");
  return {
    imageUrl: optimizeCloudinaryUrl(result.secure_url),
    imagePublicId: result.public_id,
  };
}

export async function deleteCloudinaryProductImage(publicId: string) {
  const token = await sellerToken();
  const response = await fetch("/api/uploads/cloudinary", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ publicId }),
  });
  if (!response.ok) throw new Error("The old image could not be removed.");
}

function sendUpload(url: string, body: FormData, onProgress?: (progress: number) => void) {
  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.timeout = 60_000;
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      let result: CloudinaryUploadResult;
      try {
        result = JSON.parse(request.responseText) as CloudinaryUploadResult;
      } catch {
        reject(new Error("Cloudinary returned an invalid response."));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(result.error?.message ?? "The image upload failed."));
        return;
      }
      onProgress?.(100);
      resolve(result);
    });
    request.addEventListener("error", () => reject(new Error("The image upload lost its network connection.")));
    request.addEventListener("timeout", () => reject(new Error("The image upload timed out. Try a smaller image or a faster connection.")));
    request.send(body);
  });
}

async function sellerToken() {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Your seller session expired. Sign in again and retry.");
  return user.getIdToken();
}

function optimizeCloudinaryUrl(url: string) {
  return url.replace("/image/upload/", "/image/upload/f_auto,q_auto,c_limit,w_1600/");
}
