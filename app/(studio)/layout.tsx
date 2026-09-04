import type { ReactNode } from "react";

import { DraftProvider } from "@/components/draft-provider";
import { StudioShell } from "@/components/studio-shell";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <DraftProvider>
      <StudioShell>{children}</StudioShell>
    </DraftProvider>
  );
}
