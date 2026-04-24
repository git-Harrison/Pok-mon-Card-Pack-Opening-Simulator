import AuthGate from "@/components/AuthGate";
import WildView from "@/components/WildView";

export const metadata = {
  title: "야생 | 포켓몬 카드깡 시뮬레이터",
};

export default function WildPage() {
  return (
    <AuthGate>
      <WildView />
    </AuthGate>
  );
}
