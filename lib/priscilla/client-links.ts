import { clientDirectory } from '../data'

export type ClientLink = { client_id: string; client_name: string; href: string }

// Routes and labels always come from the client directory, never from chat text.
export function clientLinksFor(clientIds: readonly string[]): ClientLink[] {
  return [...new Set(clientIds)].flatMap(id => {
    const client = clientDirectory.find(c => c.id === id)
    return client ? [{ client_id: client.id, client_name: client.name, href: `/client/${client.slug}#client-brief` }] : []
  })
}
