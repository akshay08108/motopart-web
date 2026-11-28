"use client";

import { useEffect, useState } from "react";
import { deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase";

export const accountPhotoFileTypes = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";
const photoPrefix = "data:image/jpeg;base64,";
const privatePhotoLimit = 160_000;

export async function preparePhoto(file: File, width: number, maxBytes: number) {
  if (file.size === 0 || file.size > 12 * 1024 * 1024) throw new Error("Choose a photo smaller than 12 MB.");
  if (file.type && !accountPhotoFileTypes.split(",").includes(file.type)) {
    throw new Error("Choose a JPG, PNG, WebP, AVIF or HEIC photo.");
  }

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("This photo could not be opened. Try exporting it as JPG or PNG.");
  }

  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, width / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not prepare the photo.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [.86, .72, .56, .42]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.startsWith(photoPrefix) && dataUrl.length <= maxBytes) return dataUrl;
    }
    throw new Error("This photo is too large to save. Try a smaller version.");
  } finally {
    image.close();
  }
}

function photoDocument(uid: string, vehicleId?: string) {
  return doc(firestore, "users", uid, "photos", vehicleId ? `vehicle-${vehicleId}` : "profile");
}

export function usePrivatePhoto(uid?: string, vehicleId?: string) {
  const key = JSON.stringify([uid, vehicleId]);
  const [photo, setPhoto] = useState<{ key: string; url: string }>();
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(photoDocument(uid, vehicleId), (snapshot) => {
      const url = snapshot.data()?.dataUrl;
      setPhoto({ key, url: typeof url === "string" && url.startsWith(photoPrefix) ? url : "" });
    }, () => setPhoto({ key, url: "" }));
  }, [key, uid, vehicleId]);
  return photo?.key === key ? photo.url : "";
}

export async function savePrivatePhoto(uid: string, image: File | null, vehicleId?: string) {
  if (uid !== firebaseAuth.currentUser?.uid) throw new Error("Sign in again to update your photos.");
  const reference = photoDocument(uid, vehicleId);
  const data = image
    ? { dataUrl: await preparePhoto(image, 640, privatePhotoLimit), updatedAt: serverTimestamp() }
    : null;
  if (uid !== firebaseAuth.currentUser?.uid) throw new Error("Your session changed. Sign in again and retry.");

  if (vehicleId && data) {
    const garage = doc(firestore, "users", uid, "preferences", "garage");
    await runTransaction(firestore, async (transaction) => {
      const vehicles = (await transaction.get(garage)).data()?.vehicles;
      if (!Array.isArray(vehicles) || !vehicles.some((vehicle) => vehicle?.id === vehicleId)) {
        throw new Error("This vehicle is no longer in your garage.");
      }
      transaction.set(reference, data);
    });
  } else if (data) {
    await setDoc(reference, data);
  } else {
    await deleteDoc(reference);
  }
}
