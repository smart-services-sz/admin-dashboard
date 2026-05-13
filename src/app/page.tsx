
import AdminDashboard from "@/components/admin-dashboard";
import { AuthProvider } from "@/components/auth-context";
import { getServerUser } from "@/lib/auth.server";
import PrivateRoute from "@/components/private-route";

export default async function Home() {
  const user = await getServerUser();
  return (
    <PrivateRoute>
      <AuthProvider user={user!}>
        <AdminDashboard user={user!} />
      </AuthProvider>
    </PrivateRoute>
  );
}
