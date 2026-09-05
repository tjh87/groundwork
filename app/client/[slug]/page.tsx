import { notFound } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { ClientBrief } from "@/components/client-brief"
import { clients } from "@/lib/data"

export default async function ClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const client = Object.hasOwn(clients, slug) ? clients[slug] : undefined
  if (!client) notFound()
  return <AppShell><ClientBrief key={client.id} client={client} /></AppShell>
}
