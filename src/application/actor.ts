import { TaskiError, text } from "../domain/ticket.ts";
import type { Actor } from "../domain/ticket.ts";

/** Rebuilds the actor from installation members; names and assurance never come from request data. */
export function trustedActor(members: readonly { readonly id: string; readonly name: string }[], actor: Actor): Actor {
  const member = members.find((entry) => entry.id === actor.memberId);
  if (!member) throw new TaskiError("UNKNOWN_MEMBER");
  if (!["person", "agent"].includes(actor.kind) || !["web", "http", "mcp"].includes(actor.channel)) throw new TaskiError("INVALID_ACTOR");
  text(actor.client, "client", 80);
  const result: Actor = { memberId: member.id, name: member.name, kind: actor.kind,
    channel: actor.channel, client: actor.client, identityAssurance: "self_selected" };
  if (actor.completionFor) result.completionFor = actor.completionFor;
  if (actor.authorizationRef) result.authorizationRef = text(actor.authorizationRef, "authorizationRef", 128);
  return result;
}
