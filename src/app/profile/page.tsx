import AuthGate from "@/components/AuthGate";
import ProfileView from "@/components/ProfileView";

export const metadata = {
  title: "내 프로필 | 포켓몬 카드깡 시뮬레이터",
};

export default function ProfilePage() {
  return (
    <AuthGate>
      <ProfileView />
    </AuthGate>
  );
}
