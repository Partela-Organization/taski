import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskiClient, Track } from "../../../client/index.ts";

/** Track plans (priority and target date) for the configured areas. A failed read hides plans without blocking the list. */
export function useTrackPlans(client: TaskiClient, memberId: string | undefined) {
  const [tracks, setTracks] = useState<ReadonlyMap<string, Track>>(() => new Map());
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const id = ++generation.current;
    if (!memberId) { setTracks(new Map()); return; }
    void client.listAreas().then((result) => {
      if (generation.current === id) setTracks(new Map(result.items.map((track) => [track.id, track])));
    }, () => { if (generation.current === id) setTracks(new Map()); });
    return () => { generation.current++; };
  }, [client, memberId, revision]);
  return { tracks, refresh };
}
export type TrackPlans = ReturnType<typeof useTrackPlans> & { client: TaskiClient; onExpired: () => void };
