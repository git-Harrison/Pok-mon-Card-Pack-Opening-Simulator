import AuthGate from "@/components/AuthGate";
import Ch4View from "@/components/Ch4View";

export default function Ch4Page() {
  return (
    <AuthGate>
      <Ch4View />
    </AuthGate>
  );
}
