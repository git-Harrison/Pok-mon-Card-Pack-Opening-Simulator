import AuthGate from "@/components/AuthGate";
import WalletView from "@/components/WalletView";

export const metadata = {
  title: "내 카드지갑 | 포켓몬 카드깡 시뮬레이터",
};

export default function WalletPage() {
  return (
    <AuthGate>
      <WalletView />
    </AuthGate>
  );
}
