import AuthGate from "@/components/AuthGate";
import GradingView from "@/components/GradingView";

export const metadata = {
  title: "SSS 등급 감별 | 포켓몬 카드깡 시뮬레이터",
};

export default function GradingPage() {
  return (
    <AuthGate>
      <GradingView />
    </AuthGate>
  );
}
