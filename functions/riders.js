import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { createRiderService } from "./rider-service.js";

const options = { region: "asia-south1", maxInstances: 5, timeoutSeconds: 30, memory: "256MiB" };
// Lazy initialization: index.js initializes the shared Firebase Admin app.
export const dispatchPartXDelivery = onCall(options, (request) => createRiderService(getFirestore()).dispatch(request.auth?.uid, request.data));
export const updatePartXDelivery = onCall(options, (request) => createRiderService(getFirestore()).riderAction(request.auth?.uid, request.data));
export const getPartXDeliveryCode = onCall(options, (request) => createRiderService(getFirestore()).customerCode(request.auth?.uid, request.data));
