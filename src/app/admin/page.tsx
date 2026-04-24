import AuthGate from "@/components/AuthGate";
import AdminView from "@/components/AdminView";

export const metadata = {
  title: "관리자 | 포켓몬 카드깡 시뮬레이터",
};

export default function AdminPage() {
  return (
    <AuthGate>
      <AdminView />
    </AuthGate>
  );
}
