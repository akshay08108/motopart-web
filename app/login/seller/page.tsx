import { appRole } from "@/lib/app-role";
import { RoleAuthPage } from "@/components/partx/auth-page";

export default function Page() {
  return <RoleAuthPage role="seller" signupFirst={appRole === "seller"}/>;
}
