import AuthGate from "@/components/AuthGate";
import UsersView from "@/components/UsersView";

export const metadata = {
  title: "사용자 랭킹 | 포켓몬 카드깡 시뮬레이터",
};

export default function UsersPage() {
  return (
    <AuthGate>
      <UsersView />
    </AuthGate>
  );
}
