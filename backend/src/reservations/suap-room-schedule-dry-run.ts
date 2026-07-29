import { createAppConfig } from "../config/env.js";
import {
  selectRoomsForScheduleScrape,
  SuapWebAutomationClient
} from "./suap-web-automation.client.js";

const config = createAppConfig({
  ...process.env,
  SUAP_ROOM_SCHEDULE_SYNC_ENABLED: "true",
  SUAP_ROOM_SCHEDULE_SYNC_WINDOW_DAYS:
    process.env.SUAP_ROOM_SCHEDULE_SYNC_WINDOW_DAYS ?? "7",
  SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS:
    process.env.SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS ?? "2"
});

if (!config.suap.webReadonlyEnabled) {
  throw new Error(
    "SUAP_WEB_READONLY_ENABLED precisa estar ativo no ambiente externo para o dry-run."
  );
}

if (!config.suap.webLoginConfigured || !config.suap.roomsUrl) {
  throw new Error(
    "A configuracao externa de login web e da listagem de salas do SUAP esta incompleta."
  );
}

const result = await new SuapWebAutomationClient(config).scrapeRoomSchedules();
const selectedRooms = selectRoomsForScheduleScrape(
  result.rooms,
  config.suap.roomScheduleSyncMaxRooms
);
const bySourceKind = countBy(
  result.occupancies.map((occupancy) => occupancy.sourceKind)
);
const byRoom = selectedRooms.map((room) => ({
  roomCode: room.roomCode ?? "sem-codigo",
  occupancyCount: result.occupancies.filter(
    (occupancy) => occupancy.roomExternalId === room.externalId
  ).length
}));

console.log(
  JSON.stringify(
    {
      status: "ok",
      scope: "IFBA Campus Porto Seguro (PS)",
      windowDays: config.suap.roomScheduleSyncWindowDays,
      roomsFound: result.rooms.length,
      roomPagesVisited: result.roomPagesVisited,
      roomsVisited: result.roomScheduleRoomsVisited,
      roomCodes: selectedRooms.map((room) => room.roomCode ?? "sem-codigo"),
      occupancyCount: result.occupancies.length,
      bySourceKind,
      byRoom,
      samples: result.occupancies.slice(0, 5).map((occupancy) => ({
        roomCode: occupancy.roomCode ?? "sem-codigo",
        sourceKind: occupancy.sourceKind,
        startsAt: occupancy.startsAt,
        endsAt: occupancy.endsAt,
        responsibleNamePresent: Boolean(occupancy.responsibleName),
        purposePresent: Boolean(occupancy.purpose)
      }))
    },
    null,
    2
  )
);

function countBy(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
