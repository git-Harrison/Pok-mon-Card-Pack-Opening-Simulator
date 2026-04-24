import AuthGate from "@/components/AuthGate";
import VisitCenterView from "@/components/VisitCenterView";

export const metadata = {
  title: "포켓몬센터 방문 | 포켓몬 카드깡 시뮬레이터",
};

export default async function VisitCenterPage({
  params,
}: {
  params: Promise<{ loginId: string }>;
}) {
  const { loginId } = await params;
  return (
    <AuthGate>
      <VisitCenterView loginId={decodeURIComponent(loginId)} />
    </AuthGate>
  );
}
