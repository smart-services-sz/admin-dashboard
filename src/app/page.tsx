import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin-dashboard";
import { AuthProvider } from "@/components/auth-context";
import { getServerUser } from "@/lib/auth.server";

export default async function Home() {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AuthProvider user={user}>
      <AdminDashboard user={user} />
    </AuthProvider>
  );
}
