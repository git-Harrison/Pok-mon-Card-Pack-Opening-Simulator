import AuthGate from "@/components/AuthGate";
import CardDetailView from "@/components/CardDetailView";

export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <CardDetailView cardId={id} />
    </AuthGate>
  );
}
