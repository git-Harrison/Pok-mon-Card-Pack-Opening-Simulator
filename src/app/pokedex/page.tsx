import AuthGate from "@/components/AuthGate";
import PokedexView from "@/components/PokedexView";

export const metadata = {
  title: "PCL 도감 | 포켓몬 카드깡 시뮬레이터",
};

export default function PokedexPage() {
  return (
    <AuthGate>
      <PokedexView />
    </AuthGate>
  );
}
