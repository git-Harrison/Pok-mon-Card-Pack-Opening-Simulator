import HomeView from "@/components/HomeView";
import AuthGate from "@/components/AuthGate";

export default function Home() {
  return (
    <AuthGate>
      <HomeView />
    </AuthGate>
  );
}
