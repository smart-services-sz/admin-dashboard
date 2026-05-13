import { getServerUser } from "@/lib/auth.server";
import { redirect } from "next/navigation";

export default async function PrivateRoute({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }
  return <>{children}</>;
}
