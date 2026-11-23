import { useEffect, useState } from "react";
import type { TaskiClient } from "../../client/index.ts";
import { applyTheme, readTheme } from "../theme.ts";
import type { Theme } from "../theme.ts";
import { SignIn } from "./access/sign-in.tsx";
import { useTeamSession } from "./access/use-team-session.ts";
import { Workspace } from "./workspace/workspace.tsx";

export function App({ client }: { client: TaskiClient }) {
  const session = useTeamSession(client);
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);

  return <>
    {!session.member && <SignIn access={session.access} ready={session.ready} sessionError={session.error}
      theme={theme} onTheme={setTheme} onSignIn={session.signIn} />}
    <Workspace client={client} access={session.access} member={session.member}
      theme={theme} onTheme={setTheme} onExpired={session.expire} onSignOut={session.signOut} />
  </>;
}
