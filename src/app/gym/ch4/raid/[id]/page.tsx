import AuthGate from "@/components/AuthGate";
import Ch4RaidLobby from "@/components/Ch4RaidLobby";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Ch4RaidPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <AuthGate>
      <Ch4RaidLobby raidId={id} />
    </AuthGate>
  );
}
