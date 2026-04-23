import { notFound } from "next/navigation";
import SetView from "@/components/SetView";
import AuthGate from "@/components/AuthGate";
import { SET_ORDER, getSet } from "@/lib/sets";

export function generateStaticParams() {
  return SET_ORDER.map((code) => ({ code }));
}

export default async function SetPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const set = getSet(code);
  if (!set) notFound();
  return (
    <AuthGate>
      <SetView set={set} />
    </AuthGate>
  );
}
