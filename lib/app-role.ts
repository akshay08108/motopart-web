import type { UserRole } from "./types";

const configuredRole = process.env.NEXT_PUBLIC_PARTX_APP_ROLE ?? process.env.NEXT_PUBLIC_PARTX_PORTAL;

export const appRole: UserRole | undefined =
  configuredRole === "customer" || configuredRole === "seller" || configuredRole === "rider"
    ? configuredRole
    : undefined;

export const roleHome: Record<UserRole, string> = {
  customer: "/",
  seller: "/seller",
  rider: "/rider",
};

export function roleLogin(role: UserRole) {
  return `/login/${role}`;
}
