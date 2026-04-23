import AuthGate from "@/components/AuthGate";
import GiftsView from "@/components/GiftsView";

export const metadata = {
  title: "선물함 | 포켓몬 카드깡 시뮬레이터",
};

export default function GiftsPage() {
  return (
    <AuthGate>
      <GiftsView />
    </AuthGate>
  );
}
