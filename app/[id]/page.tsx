import { ShareView } from "./share-view";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShareView requestedId={id} />;
}
