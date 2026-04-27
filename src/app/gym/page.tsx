import GymView from "@/components/GymView";
import AuthGate from "@/components/AuthGate";

export default function GymPage() {
  return (
    <AuthGate>
      <GymView />
    </AuthGate>
  );
}
