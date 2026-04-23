import AuthGate from "@/components/AuthGate";
import MerchantView from "@/components/MerchantView";

export const metadata = {
  title: "카드 상인 | 포켓몬 카드깡 시뮬레이터",
};

export default function MerchantPage() {
  return (
    <AuthGate>
      <MerchantView />
    </AuthGate>
  );
}
