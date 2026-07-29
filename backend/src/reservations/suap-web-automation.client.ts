import { chromium, type Browser, type Page } from "playwright";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import { createReservationFingerprint } from "./fingerprint.js";
import { normalizeSuapReportRow } from "./suap-report-normalizer.js";
import {
  buildFutureSuapReservationReportUrl,
  parseSuapReservationReportFilters
} from "./suap-reservation-report-url.js";
import { parseSuapReportRowsFromTableCells } from "./suap-report-table-parser.js";
import {
  parseSuapRoomTableRows,
  type SuapRoomTableRow
} from "./suap-room-table-parser.js";
import type { NormalizedReservation, ScrapedSuapRoom } from "./types.js";
import {
  normalizeSuapRoomScheduleText
} from "../occupancies/suap-room-schedule-normalizer.js";
import type { NormalizedOccupancy } from "../occupancies/types.js";

export interface SuapWebScrapeResult {
  readonly reportUrl: string;
  readonly filters: ReturnType<typeof parseSuapReservationReportFilters>;
  readonly pagesVisited: number;
  readonly reservations: readonly NormalizedReservation[];
  readonly occupancies: readonly NormalizedOccupancy[];
  readonly rooms: readonly ScrapedSuapRoom[];
  readonly roomsUrl: string;
  readonly roomPagesVisited: number;
  readonly roomScheduleSyncEnabled: boolean;
  readonly roomScheduleRoomsVisited: number;
}

export interface SuapRoomScheduleScrapeResult {
  readonly rooms: readonly ScrapedSuapRoom[];
  readonly roomsUrl: string;
  readonly roomPagesVisited: number;
  readonly roomScheduleRoomsVisited: number;
  readonly occupancies: readonly NormalizedOccupancy[];
}

export class SuapWebAutomationClient {
  constructor(private readonly config: AppConfig) {}

  buildReportUrl(now = new Date()): string {
    const reportUrl = this.config.suapRuntime.reservationReportUrl;
    if (!reportUrl) {
      throw new HttpError(
        503,
        "suap_reservation_report_url_not_configured",
        "URL do relatorio de reservas do SUAP nao configurada."
      );
    }

    return buildFutureSuapReservationReportUrl({
      baseUrl: reportUrl,
      now,
      windowDays: this.config.suap.reservationSyncWindowDays,
      horaInicio: this.config.suap.reservationStartTime,
      horaFim: this.config.suap.reservationEndTime,
      campus: this.config.suap.reservationCampusId,
      situacao: this.config.suap.reservationStatus
    });
  }

  async scrapeReservations(now = new Date()): Promise<SuapWebScrapeResult> {
    const loginUrl = this.requireRuntimeValue(
      this.config.suapRuntime.loginUrl,
      "suap_login_url_not_configured",
      "URL de login do SUAP nao configurada."
    );
    const username = this.requireRuntimeValue(
      this.config.suapRuntime.username,
      "suap_username_not_configured",
      "Usuario do SUAP nao configurado."
    );
    const password = this.requireRuntimeValue(
      this.config.suapRuntime.password,
      "suap_password_not_configured",
      "Senha do SUAP nao configurada."
    );
    const reportUrl = this.buildReportUrl(now);
    const roomsUrl = this.requireRuntimeValue(
      this.config.suapRuntime.roomsUrl,
      "suap_rooms_url_not_configured",
      "URL da listagem de salas do SUAP nao configurada."
    );
    let browser: Browser | undefined;

    try {
      browser = await chromium.launch({
        headless: this.config.suap.browserHeadless
      });
      const page = await browser.newPage();
      page.setDefaultTimeout(this.config.suap.browserTimeoutMs);

      await login(page, loginUrl, username, password);
      const rooms = await readAllRoomPages(page, roomsUrl, now);
      const reservations = await readAllReportPages(page, reportUrl, now);
      const roomSchedules = await readRoomScheduleOccupancies(
        page,
        rooms.results,
        now,
        this.config
      );

      return {
        reportUrl,
        filters: parseSuapReservationReportFilters(reportUrl),
        pagesVisited: reservations.pagesVisited,
        reservations: reservations.results,
        occupancies: roomSchedules.results,
        rooms: rooms.results,
        roomsUrl,
        roomPagesVisited: rooms.pagesVisited,
        roomScheduleSyncEnabled: this.config.suap.roomScheduleSyncEnabled,
        roomScheduleRoomsVisited: roomSchedules.roomsVisited
      };
    } finally {
      await browser?.close();
    }
  }

  async scrapeRoomSchedules(
    now = new Date()
  ): Promise<SuapRoomScheduleScrapeResult> {
    const loginUrl = this.requireRuntimeValue(
      this.config.suapRuntime.loginUrl,
      "suap_login_url_not_configured",
      "URL de login do SUAP nao configurada."
    );
    const username = this.requireRuntimeValue(
      this.config.suapRuntime.username,
      "suap_username_not_configured",
      "Usuario do SUAP nao configurado."
    );
    const password = this.requireRuntimeValue(
      this.config.suapRuntime.password,
      "suap_password_not_configured",
      "Senha do SUAP nao configurada."
    );
    const roomsUrl = this.requireRuntimeValue(
      this.config.suapRuntime.roomsUrl,
      "suap_rooms_url_not_configured",
      "URL da listagem de salas do SUAP nao configurada."
    );
    let browser: Browser | undefined;

    try {
      browser = await chromium.launch({
        headless: this.config.suap.browserHeadless
      });
      const page = await browser.newPage();
      page.setDefaultTimeout(this.config.suap.browserTimeoutMs);

      await login(page, loginUrl, username, password);
      const rooms = await readAllRoomPages(page, roomsUrl, now);
      const roomSchedules = await readRoomScheduleOccupancies(
        page,
        rooms.results,
        now,
        this.config
      );

      return {
        rooms: rooms.results,
        roomsUrl,
        roomPagesVisited: rooms.pagesVisited,
        roomScheduleRoomsVisited: roomSchedules.roomsVisited,
        occupancies: roomSchedules.results
      };
    } finally {
      await browser?.close();
    }
  }

  private requireRuntimeValue(
    value: string | undefined,
    code: string,
    message: string
  ): string {
    if (!value) {
      throw new HttpError(503, code, message);
    }

    return value;
  }
}

export function selectRoomsForScheduleScrape(
  rooms: readonly ScrapedSuapRoom[],
  maxRooms: number
): readonly ScrapedSuapRoom[] {
  if (maxRooms <= 0) {
    return [];
  }

  return rooms
    .filter(
      (room) =>
        room.campus === "PS" &&
        room.active &&
        room.schedulable &&
        room.scheduleUrl
    )
    .slice(0, maxRooms);
}

async function readAllRoomPages(
  page: Page,
  roomsUrl: string,
  now: Date
): Promise<{ readonly pagesVisited: number; readonly results: readonly ScrapedSuapRoom[] }> {
  const results = new Map<string, ScrapedSuapRoom>();
  const visitedUrls = new Set<string>();
  let pagesVisited = 0;
  await page.goto(roomsUrl, { waitUntil: "domcontentloaded" });

  for (;;) {
    const currentUrl = page.url();
    if (visitedUrls.has(currentUrl)) break;
    visitedUrls.add(currentUrl);
    pagesVisited += 1;

    const rows = await extractRoomRows(page);
    for (const room of parseSuapRoomTableRows(
      rows.headers,
      rows.rows,
      currentUrl,
      now.toISOString()
    )) {
      results.set(room.externalId, room);
    }

    const nextLink = page
      .locator('a:has-text("proximo"), a:has-text("próximo"), a:has-text("Próximo")')
      .last();
    if ((await nextLink.count()) === 0) break;
    const href = await nextLink.getAttribute("href");
    if (!href || href === "#") break;
    const nextUrl = new URL(href, currentUrl).toString();
    if (visitedUrls.has(nextUrl)) break;
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      nextLink.click()
    ]);
  }

  return { pagesVisited, results: [...results.values()] };
}

async function extractRoomRows(page: Page): Promise<{
  readonly headers: readonly string[];
  readonly rows: readonly SuapRoomTableRow[];
}> {
  const table = page.locator("table").filter({ hasText: "Nome" }).first();
  const data = await table.evaluate((element) => {
    const readCellText = (cell: Element): string => {
      const parts = [cell.textContent ?? ""];
      for (const child of Array.from(cell.querySelectorAll("*"))) {
        parts.push(child.getAttribute("title") ?? "");
        parts.push(child.getAttribute("aria-label") ?? "");
        parts.push(child.getAttribute("alt") ?? "");
      }
      return parts.filter(Boolean).join(" ");
    };
    const rows = Array.from(element.querySelectorAll("tr"));
    const headers = Array.from(rows[0]?.querySelectorAll("th,td") ?? [])
      .map((cell) => readCellText(cell));
    const bodyRows = rows.slice(1).map((row) => ({
      cells: Array.from(row.querySelectorAll("td")).map((cell) =>
        readCellText(cell)
      ),
      links: Array.from(row.querySelectorAll("a")).map((link) => ({
        text: link.textContent ?? "",
        href: link.getAttribute("href") ?? ""
      }))
    }));
    return { headers, rows: bodyRows };
  });
  return data;
}

async function readRoomScheduleOccupancies(
  page: Page,
  rooms: readonly ScrapedSuapRoom[],
  now: Date,
  config: AppConfig
): Promise<{
  readonly roomsVisited: number;
  readonly results: readonly NormalizedOccupancy[];
}> {
  if (!config.suap.roomScheduleSyncEnabled) {
    return { roomsVisited: 0, results: [] };
  }

  const selectedRooms = selectRoomsForScheduleScrape(
    rooms,
    config.suap.roomScheduleSyncMaxRooms
  );
  const results: NormalizedOccupancy[] = [];
  const fromDate = toSaoPauloIsoDate(now);
  const toDate = addDaysIsoDate(
    fromDate,
    config.suap.roomScheduleSyncWindowDays
  );
  const syncedAt = now.toISOString();

  for (const room of selectedRooms) {
    if (!room.scheduleUrl) {
      continue;
    }

    const scheduleUrl = new URL(
      room.scheduleUrl,
      config.suapRuntime.baseUrl ?? page.url()
    ).toString();

    await page.goto(scheduleUrl, { waitUntil: "domcontentloaded" });
    const text = await page.locator("body").innerText();
    results.push(
      ...normalizeSuapRoomScheduleText({
        text,
        sourceUrl: scheduleUrl,
        roomExternalId: room.externalId,
        roomCode: room.roomCode,
        roomName: room.name,
        campus: room.campus,
        syncedAt,
        fromDate,
        toDate
      })
    );
  }

  return {
    roomsVisited: selectedRooms.length,
    results
  };
}

async function login(
  page: Page,
  loginUrl: string,
  username: string,
  password: string
): Promise<void> {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"], input#id_username').first().fill(username);
  await page.locator('input[name="password"], input#id_password').first().fill(password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator('button[type="submit"], input[type="submit"]').first().click()
  ]);
}

async function readAllReportPages(
  page: Page,
  reportUrl: string,
  now: Date
): Promise<{
  readonly pagesVisited: number;
  readonly results: readonly NormalizedReservation[];
}> {
  const results: NormalizedReservation[] = [];
  let pagesVisited = 0;
  const visitedUrls = new Set<string>();

  await page.goto(reportUrl, { waitUntil: "domcontentloaded" });

  for (;;) {
    const currentUrl = page.url();
    if (visitedUrls.has(currentUrl)) {
      break;
    }

    visitedUrls.add(currentUrl);
    pagesVisited += 1;

    const rows = await extractReportRows(page);
    const syncedAt = now.toISOString();
    for (const row of rows) {
      const reservation = normalizeSuapReportRow(row, syncedAt);
      if (reservation) {
        results.push(reservation);
      }
    }

    const nextLink = page
      .locator('a:has-text("proximo"), a:has-text("próximo"), a:has-text("Próximo")')
      .last();

    if ((await nextLink.count()) === 0) {
      break;
    }

    const href = await nextLink.getAttribute("href");
    if (!href || href === "#" || href === currentUrl) {
      break;
    }

    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      nextLink.click()
    ]);
  }

  return { pagesVisited, results: uniquifyReservationExternalIds(results) };
}

async function extractReportRows(page: Page) {
  const table = page.locator("table").filter({ hasText: "Solicitante" }).first();
  const data = await table.evaluate((element) => {
    const rows = Array.from(element.querySelectorAll("tr"));
    const headerCells = Array.from(rows[0]?.querySelectorAll("th,td") ?? []);
    const headers = headerCells.map((cell) => cell.textContent ?? "");
    const bodyRows = rows.slice(1).map((row) => ({
      cells: Array.from(row.querySelectorAll("td")).map(
        (cell) => cell.textContent ?? ""
      ),
      links: Array.from(row.querySelectorAll("a")).map((link) => ({
        text: link.textContent ?? "",
        href: link.getAttribute("href") ?? ""
      }))
    }));

    return { headers, bodyRows };
  });

  return parseSuapReportRowsFromTableCells(
    data.headers,
    data.bodyRows,
    page.url()
  );
}

function uniquifyReservationExternalIds(
  reservations: readonly NormalizedReservation[]
): readonly NormalizedReservation[] {
  const grouped = new Map<string, NormalizedReservation[]>();
  for (const reservation of reservations) {
    grouped.set(reservation.externalId, [
      ...(grouped.get(reservation.externalId) ?? []),
      reservation
    ]);
  }

  return [...grouped.values()].flatMap((group) => {
    if (group.length === 1) {
      return group;
    }

    return [...group]
      .sort((left, right) =>
        [
          left.startsAt.localeCompare(right.startsAt),
          left.endsAt.localeCompare(right.endsAt),
          (left.roomExternalId ?? "").localeCompare(right.roomExternalId ?? "")
        ].find((result) => result !== 0) ?? 0
      )
      .map((reservation, index) => withExternalId(
        reservation,
        `${reservation.externalId}-${index + 1}`
      ));
  });
}

function withExternalId(
  reservation: NormalizedReservation,
  externalId: string
): NormalizedReservation {
  const next = {
    ...reservation,
    externalId
  };

  return {
    ...next,
    fingerprint: createReservationFingerprint(next)
  };
}

function toSaoPauloIsoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return [
    parts.find((part) => part.type === "year")?.value,
    parts.find((part) => part.type === "month")?.value,
    parts.find((part) => part.type === "day")?.value
  ].join("-");
}

function addDaysIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}
