import AuthGate from "@/components/AuthGate";
import MyPokemonView from "@/components/MyPokemonView";

export const metadata = {
  title: "내 포켓몬 | 포켓몬 카드깡 시뮬레이터",
};

export default function MyPokemonPage() {
  return (
    <AuthGate>
      <MyPokemonView />
    </AuthGate>
  );
}
