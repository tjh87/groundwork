import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { asOf } from "@/lib/data"
import { PriscillaScanButton } from "./priscilla/surfaces"

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Groundwork morning list">
          <span className="grid size-9 place-items-center bg-primary text-primary-foreground"><ShieldCheck className="size-4" /></span>
          <span><span className="block text-sm font-semibold tracking-[0.16em]">GROUNDWORK</span><span className="hidden text-[11px] text-muted-foreground sm:block">RM intelligence workbench</span></span>
        </Link>
        <div className="flex items-center gap-3 text-xs text-muted-foreground text-right"><span className="hidden items-center gap-2 lg:flex">Synthetic demo · fixed snapshot</span><span className="hidden border-l border-border pl-3 md:block">As of {asOf}</span><PriscillaScanButton /></div>
      </div>
    </header>{children}
  </div>
}
