export interface SuapRoomReservationTarget {
  readonly url: string;
  readonly roomId: string;
}

export function extractSuapRoomIdFromReservationUrl(
  value: string
): string | undefined {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  const match = url.pathname.match(
    /^\/comum\/sala\/solicitar_reserva\/([^/]+)\/?$/
  );
  return match?.[1];
}

export function createSuapRoomTargets(
  urls: readonly string[]
): readonly SuapRoomReservationTarget[] {
  return urls.flatMap((url) => {
    const roomId = extractSuapRoomIdFromReservationUrl(url);
    return roomId ? [{ url, roomId }] : [];
  });
}
