import { useEffect, useState } from "react";
import { readWorkspaceIdentity, type WorkspaceIdentity } from "./workspaceSession";

export function useWorkspaceIdentity(): WorkspaceIdentity | null {
  const [identity, setIdentity] = useState<WorkspaceIdentity | null>(() => readWorkspaceIdentity());
  useEffect(() => {
    const sync = () => setIdentity(readWorkspaceIdentity());
    window.addEventListener("apex-workspace-identity", sync);
    return () => window.removeEventListener("apex-workspace-identity", sync);
  }, []);
  return identity;
}
