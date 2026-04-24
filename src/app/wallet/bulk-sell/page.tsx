import AuthGate from "@/components/AuthGate";
import BulkSellView from "@/components/BulkSellView";

export const metadata = {
  title: "일괄 판매 | 포켓몬 카드깡 시뮬레이터",
};

export default function BulkSellPage() {
  return (
    <AuthGate>
      <BulkSellView />
    </AuthGate>
  );
}
