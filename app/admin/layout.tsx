import type { Metadata } from "next";
import { AdminSession } from "./session";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "PartX Operations",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.root}><AdminSession>{children}</AdminSession></div>;
}
