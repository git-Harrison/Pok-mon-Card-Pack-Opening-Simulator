import AuthGate from "@/components/AuthGate";
import CenterView from "@/components/CenterView";

export const metadata = {
  title: "내 포켓몬센터 | 포켓몬 카드깡 시뮬레이터",
};

export default function CenterPage() {
  return (
    <AuthGate>
      <CenterView />
    </AuthGate>
  );
}
