import LiveFlow from "@/components/product/live/flow";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ b?: string }> }) {
  const { id } = await params;
  const { b } = await searchParams;
  return <LiveFlow worldId={id} branchId={b} />;
}
