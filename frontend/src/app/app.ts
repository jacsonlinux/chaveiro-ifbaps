import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

type KeyStatus =
  | 'disponivel'
  | 'bloqueada_por_reserva'
  | 'retirada'
  | 'atrasada'
  | 'em_manutencao'
  | 'perdida'
  | 'danificada';

type UserRole = 'usuario' | 'portaria' | 'admin';
type AppView = 'operacao' | 'reservas' | 'movimentacoes' | 'ocorrencias' | 'administracao';
type ReservationStatus =
  | 'active'
  | 'changed'
  | 'suspect_absent'
  | 'absent'
  | 'canceled'
  | 'conflicted';

interface AppViewOption {
  readonly id: AppView;
  readonly label: string;
}

interface SessionResponse {
  readonly authenticated: boolean;
  readonly user: {
    readonly userId?: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly campus?: string;
  } | null;
  readonly roles: readonly UserRole[];
}

interface Room {
  readonly id: string;
  readonly name: string;
  readonly campus?: string;
  readonly externalRefs?: readonly string[];
  readonly provisional?: boolean;
}

interface PhysicalKey {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly baseStatus: KeyStatus;
  readonly provisional?: boolean;
}

interface KeyRoomLink {
  readonly keyId: string;
  readonly roomId: string;
}

interface Reservation {
  readonly externalId: string;
  readonly source: 'local' | 'suap-api' | 'suap-web';
  readonly roomName: string;
  readonly roomExternalId?: string;
  readonly campus?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly responsibleName?: string;
  readonly responsibleIdentifier?: string;
  readonly purpose?: string;
  readonly status: ReservationStatus;
  readonly lastSyncedAt: string;
}

interface ReservationSyncStatus {
  readonly scheduler: {
    readonly enabled: boolean;
    readonly running: boolean;
    readonly lastStartedAt?: string;
    readonly lastFinishedAt?: string;
    readonly nextRunAt?: string;
    readonly failureCount?: number;
    readonly lastError?: string;
    readonly lastResult?: {
      readonly provider: string;
      readonly syncedAt: string;
      readonly created: number;
      readonly updated: number;
      readonly unchanged: number;
      readonly absent: number;
      readonly canceled: number;
      readonly conflicted: number;
      readonly failed: number;
      readonly reservationCount?: number;
    };
  };
}

interface KeyAvailability {
  readonly key: PhysicalKey;
  readonly rooms: readonly Room[];
  readonly status: KeyStatus;
  readonly blockingReservation?: {
    readonly externalId: string;
    readonly roomName: string;
    readonly startsAt: string;
    readonly endsAt: string;
  };
}

interface KeyMovement {
  readonly id: string;
  readonly keyId: string;
  readonly roomId: string;
  readonly status: 'retirada' | 'devolvida' | 'atrasada';
  readonly responsibleName: string;
  readonly checkedOutByName: string;
  readonly checkedOutAt: string;
  readonly expectedReturnAt?: string;
  readonly returnedAt?: string;
}

interface KeyOccurrence {
  readonly id: string;
  readonly keyId: string;
  readonly roomId?: string;
  readonly type: 'ocorrencia' | 'ajuste_admin';
  readonly previousStatus: KeyStatus;
  readonly targetStatus?: KeyStatus;
  readonly actorName: string;
  readonly occurredAt: string;
  readonly notes: string;
}

interface AppUser {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
}

interface ListResponse<T> {
  readonly count: number;
  readonly results: readonly T[];
}

declare global {
  interface Window {
    KEYCHAIN_CONFIG?: {
      apiBaseUrl?: string;
    };
  }
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  readonly apiBase = signal(
    localStorage.getItem('keychain_api_base') ?? window.KEYCHAIN_CONFIG?.apiBaseUrl ?? '',
  );
  readonly session = signal<SessionResponse | null>(null);
  readonly availability = signal<readonly KeyAvailability[]>([]);
  readonly movements = signal<readonly KeyMovement[]>([]);
  readonly occurrences = signal<readonly KeyOccurrence[]>([]);
  readonly users = signal<readonly AppUser[]>([]);
  readonly rooms = signal<readonly Room[]>([]);
  readonly keys = signal<readonly PhysicalKey[]>([]);
  readonly keyRoomLinks = signal<readonly KeyRoomLink[]>([]);
  readonly reservations = signal<readonly Reservation[]>([]);
  readonly reservationSyncStatus = signal<ReservationSyncStatus | null>(null);
  readonly roleDrafts = signal<Record<string, readonly UserRole[]>>({});
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal<KeyStatus | 'todas'>('todas');
  readonly reservationSearch = signal('');
  readonly reservationStatusFilter = signal<ReservationStatus | 'todas'>('todas');
  readonly activeView = signal<AppView>('operacao');

  withdrawal = {
    keyId: '',
    roomId: '',
    responsibleName: '',
    responsibleIdentifier: '',
    actorName: '',
    actorIdentifier: '',
    expectedReturnAt: '',
    notes: '',
  };

  returnForm = {
    keyId: '',
    actorName: '',
    actorIdentifier: '',
    notes: '',
  };

  occurrence = {
    keyId: '',
    roomId: '',
    type: 'ocorrencia' as 'ocorrencia' | 'ajuste_admin',
    targetStatus: '' as '' | KeyStatus,
    actorName: '',
    actorIdentifier: '',
    notes: '',
  };

  roomForm = {
    id: '',
    name: '',
    campus: 'PS',
    externalRefs: '',
  };

  keyForm = {
    id: '',
    code: '',
    label: '',
    baseStatus: 'disponivel' as KeyStatus,
  };

  keyRoomLinkForm = {
    keyId: '',
    roomId: '',
  };

  readonly filteredAvailability = computed(() => {
    const query = normalize(this.search());
    const status = this.statusFilter();

    return this.availability().filter((item) => {
      const text = normalize(
        [item.key.code, item.key.label, ...item.rooms.map((room) => room.name)]
          .filter(Boolean)
          .join(' '),
      );
      return (!query || text.includes(query)) && (status === 'todas' || item.status === status);
    });
  });

  readonly filteredReservations = computed(() => {
    const query = normalize(this.reservationSearch());
    const status = this.reservationStatusFilter();

    return this.reservations().filter((reservation) => {
      const text = normalize(
        [
          reservation.roomName,
          reservation.campus,
          reservation.purpose,
          this.reservationResponsibleLabel(reservation),
        ]
          .filter(Boolean)
          .join(' '),
      );
      return (!query || text.includes(query)) && (status === 'todas' || reservation.status === status);
    });
  });

  readonly counts = computed(() => {
    const items = this.availability();
    return {
      total: items.length,
      disponivel: items.filter((item) => item.status === 'disponivel').length,
      bloqueada: items.filter((item) => item.status === 'bloqueada_por_reserva').length,
      retirada: items.filter((item) => item.status === 'retirada').length,
      atrasada: items.filter((item) => item.status === 'atrasada').length,
      indisponivel: items.filter(
        (item) =>
          item.status === 'em_manutencao' ||
          item.status === 'perdida' ||
          item.status === 'danificada',
      ).length,
    };
  });

  readonly isAdmin = computed(() => this.hasRole('admin'));
  readonly canMoveKeys = computed(() => this.hasRole('portaria') || this.hasRole('admin'));
  readonly isSignedIn = computed(() => this.session()?.authenticated ?? false);
  readonly catalogCounts = computed(() => ({
    rooms: this.rooms().length,
    keys: this.keys().length,
    links: this.keyRoomLinks().length,
  }));
  readonly availableViews = computed<readonly AppViewOption[]>(() => {
    if (!this.isSignedIn()) {
      return [];
    }

    const views: AppViewOption[] = [
      { id: 'operacao', label: 'Operacao' },
      { id: 'reservas', label: 'Reservas' },
    ];
    if (this.canMoveKeys()) {
      views.push(
        { id: 'movimentacoes', label: 'Movimentacoes' },
        { id: 'ocorrencias', label: 'Ocorrencias' },
      );
    }
    if (this.isAdmin()) {
      views.push({ id: 'administracao', label: 'Administracao' });
    }

    return views;
  });

  ngOnInit(): void {
    this.consumeLoginStatus();
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.loadSession();
      this.ensureAllowedView();
      if (!this.isSignedIn()) {
        this.availability.set([]);
        this.movements.set([]);
        this.occurrences.set([]);
        this.users.set([]);
        this.rooms.set([]);
        this.keys.set([]);
        this.keyRoomLinks.set([]);
        this.reservations.set([]);
        this.reservationSyncStatus.set(null);
        this.roleDrafts.set({});
        return;
      }

      await this.loadOperationalData();
    } catch (error) {
      this.error.set(toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  login(): void {
    window.location.href = this.url('/auth/suap/login');
  }

  async logout(): Promise<void> {
    await this.post('/auth/logout', {});
    this.session.set(null);
    this.availability.set([]);
    this.movements.set([]);
    this.occurrences.set([]);
    this.users.set([]);
    this.rooms.set([]);
    this.keys.set([]);
    this.keyRoomLinks.set([]);
    this.reservations.set([]);
    this.reservationSyncStatus.set(null);
    this.roleDrafts.set({});
    this.activeView.set('operacao');
    this.saved.set('Sessao encerrada.');
  }

  saveApiBase(): void {
    localStorage.setItem('keychain_api_base', this.apiBase().trim());
    this.saved.set('URL da API atualizada.');
    void this.reload();
  }

  async registerWithdrawal(): Promise<void> {
    await this.submit(async () => {
      await this.post(
        '/api/key-movements/withdrawals',
        compact({
          ...this.withdrawal,
          expectedReturnAt: this.toIsoOrEmpty(this.withdrawal.expectedReturnAt),
        }),
      );
      this.withdrawal = {
        keyId: '',
        roomId: '',
        responsibleName: '',
        responsibleIdentifier: '',
        actorName: this.withdrawal.actorName,
        actorIdentifier: this.withdrawal.actorIdentifier,
        expectedReturnAt: '',
        notes: '',
      };
      this.saved.set('Retirada registrada.');
    });
  }

  async registerReturn(): Promise<void> {
    await this.submit(async () => {
      await this.post('/api/key-movements/returns', compact(this.returnForm));
      this.returnForm = {
        keyId: '',
        actorName: this.returnForm.actorName,
        actorIdentifier: this.returnForm.actorIdentifier,
        notes: '',
      };
      this.saved.set('Devolucao registrada.');
    });
  }

  async registerOccurrence(): Promise<void> {
    await this.submit(async () => {
      await this.post('/api/key-occurrences', compact(this.occurrence));
      this.occurrence = {
        keyId: '',
        roomId: '',
        type: 'ocorrencia',
        targetStatus: '',
        actorName: this.occurrence.actorName,
        actorIdentifier: this.occurrence.actorIdentifier,
        notes: '',
      };
      this.saved.set('Ocorrencia registrada.');
    });
  }

  async saveUserRoles(user: AppUser): Promise<void> {
    await this.submit(async () => {
      const roles = this.roleDraft(user).filter((role) => role !== 'usuario');
      await this.patch(`/api/users/${encodeURIComponent(user.id)}/roles`, {
        roles,
      });
      this.saved.set('Perfis atualizados.');
    });
  }

  async createRoom(): Promise<void> {
    await this.submit(async () => {
      await this.post(
        '/api/rooms',
        compact({
          ...this.roomForm,
          externalRefs: parseCsv(this.roomForm.externalRefs),
        }),
      );
      this.roomForm = {
        id: '',
        name: '',
        campus: this.roomForm.campus,
        externalRefs: '',
      };
      this.saved.set('Sala cadastrada.');
    });
  }

  async createKey(): Promise<void> {
    await this.submit(async () => {
      await this.post('/api/keys', compact(this.keyForm));
      this.keyForm = {
        id: '',
        code: '',
        label: '',
        baseStatus: 'disponivel',
      };
      this.saved.set('Chave cadastrada.');
    });
  }

  async createKeyRoomLink(): Promise<void> {
    await this.submit(async () => {
      await this.post('/api/key-room-links', compact(this.keyRoomLinkForm));
      this.keyRoomLinkForm = {
        keyId: '',
        roomId: '',
      };
      this.saved.set('Vinculo cadastrado.');
    });
  }

  async syncReservations(): Promise<void> {
    await this.submit(async () => {
      await this.post('/api/reservations/sync', {});
      this.saved.set('Reservas sincronizadas.');
    });
  }

  selectKey(item: KeyAvailability): void {
    this.withdrawal.keyId = item.key.id;
    this.withdrawal.roomId = item.rooms[0]?.id ?? '';
    this.returnForm.keyId = item.key.id;
    this.occurrence.keyId = item.key.id;
    this.occurrence.roomId = item.rooms[0]?.id ?? '';
  }

  setActiveView(view: AppView): void {
    if (this.availableViews().some((option) => option.id === view)) {
      this.activeView.set(view);
    }
  }

  roleDraft(user: AppUser): readonly UserRole[] {
    return this.roleDrafts()[user.id] ?? user.roles;
  }

  roleChecked(user: AppUser, role: UserRole): boolean {
    return this.roleDraft(user).includes(role);
  }

  setUserRoleDraft(user: AppUser, role: UserRole, checked: boolean): void {
    const roles = new Set<UserRole>(this.roleDraft(user));
    roles.add('usuario');

    if (checked) {
      roles.add(role);
    } else {
      roles.delete(role);
    }

    this.roleDrafts.update((drafts) => ({
      ...drafts,
      [user.id]: orderRoles(roles),
    }));
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      disponivel: 'Disponivel',
      bloqueada_por_reserva: 'Reserva',
      retirada: 'Retirada',
      atrasada: 'Atrasada',
      em_manutencao: 'Manutencao',
      perdida: 'Perdida',
      danificada: 'Danificada',
      devolvida: 'Devolvida',
    };
    return labels[status] ?? status;
  }

  roomName(roomId: string): string {
    return this.rooms().find((room) => room.id === roomId)?.name ?? roomId;
  }

  keyLabel(keyId: string): string {
    const key = this.keys().find((item) => item.id === keyId);
    return key ? `${key.code} - ${key.label}` : keyId;
  }

  reservationStatusLabel(status: ReservationStatus): string {
    const labels: Record<ReservationStatus, string> = {
      active: 'Ativa',
      changed: 'Alterada',
      suspect_absent: 'Ausente?',
      absent: 'Ausente',
      canceled: 'Cancelada',
      conflicted: 'Conflito',
    };
    return labels[status];
  }

  reservationResponsibleLabel(reservation: Reservation): string {
    if (!this.canMoveKeys()) {
      return '-';
    }

    return reservation.responsibleName || reservation.responsibleIdentifier || '-';
  }

  syncSummary(): string {
    if (!this.isAdmin()) {
      return 'Consulta do backend';
    }

    const status = this.reservationSyncStatus()?.scheduler;
    if (!status) {
      return 'Status indisponivel';
    }

    if (!status.enabled) {
      return 'Agendamento desligado';
    }

    if (status.running) {
      return 'Sincronizacao em andamento';
    }

    return status.nextRunAt ? `Proxima: ${this.formatDate(status.nextRunAt)}` : 'Agendamento ativo';
  }

  private hasRole(role: UserRole): boolean {
    return this.session()?.roles.includes(role) ?? false;
  }

  private ensureAllowedView(): void {
    if (!this.availableViews().some((option) => option.id === this.activeView())) {
      this.activeView.set('operacao');
    }
  }

  formatDate(value?: string): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  private async submit(action: () => Promise<void>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.saved.set(null);

    try {
      await action();
      await this.loadOperationalData();
    } catch (error) {
      this.error.set(toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSession(): Promise<void> {
    this.session.set(await this.get<SessionResponse>('/auth/session'));
  }

  private async loadAvailability(): Promise<void> {
    const response = await this.get<ListResponse<KeyAvailability>>('/api/keys/availability');
    this.availability.set(response.results);
  }

  private async loadMovements(): Promise<void> {
    const [late, open] = await Promise.all([
      this.get<ListResponse<KeyMovement>>('/api/key-movements?status=atrasada'),
      this.get<ListResponse<KeyMovement>>('/api/key-movements?status=retirada'),
    ]);
    this.movements.set([...late.results, ...open.results]);
  }

  private async loadOccurrences(): Promise<void> {
    const response = await this.get<ListResponse<KeyOccurrence>>('/api/key-occurrences');
    this.occurrences.set(response.results.slice(0, 20));
  }

  private async loadReservations(): Promise<void> {
    const response = await this.get<ListResponse<Reservation>>('/api/reservations');
    this.reservations.set(response.results);
  }

  private async loadReservationSyncStatus(): Promise<void> {
    if (!this.isAdmin()) {
      this.reservationSyncStatus.set(null);
      return;
    }

    this.reservationSyncStatus.set(
      await this.get<ReservationSyncStatus>('/api/reservations/sync/status'),
    );
  }

  private async loadUsers(): Promise<void> {
    if (!this.isAdmin()) {
      this.users.set([]);
      this.roleDrafts.set({});
      this.rooms.set([]);
      this.keys.set([]);
      this.keyRoomLinks.set([]);
      this.reservationSyncStatus.set(null);
      return;
    }

    const [users, rooms, keys, links] = await Promise.all([
      this.get<ListResponse<AppUser>>('/api/users'),
      this.get<ListResponse<Room>>('/api/rooms'),
      this.get<ListResponse<PhysicalKey>>('/api/keys'),
      this.get<ListResponse<KeyRoomLink>>('/api/key-room-links'),
    ]);
    this.users.set(users.results);
    this.rooms.set(rooms.results);
    this.keys.set(keys.results);
    this.keyRoomLinks.set(links.results);
    this.roleDrafts.set(
      Object.fromEntries(users.results.map((user) => [user.id, orderRoles(user.roles)])),
    );
  }

  private async loadOperationalData(): Promise<void> {
    const tasks = [this.loadAvailability(), this.loadReservations()];

    if (this.canMoveKeys()) {
      tasks.push(this.loadMovements(), this.loadOccurrences());
    } else {
      this.movements.set([]);
      this.occurrences.set([]);
    }

    await Promise.all(tasks);
    await Promise.all([this.loadUsers(), this.loadReservationSyncStatus()]);
  }

  private get<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(this.url(path), {
        withCredentials: true,
      }),
    );
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(this.url(path), body, {
        withCredentials: true,
      }),
    );
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.patch<T>(this.url(path), body, {
        withCredentials: true,
      }),
    );
  }

  private url(path: string): string {
    const base = this.apiBase().trim().replace(/\/$/, '');
    return base ? `${base}${path}` : path;
  }

  private toIsoOrEmpty(value: string): string {
    return value ? new Date(value).toISOString() : '';
  }

  private consumeLoginStatus(): void {
    const url = new URL(window.location.href);
    if (url.searchParams.get('login') !== 'suap-ok') {
      return;
    }

    this.saved.set('Login SUAP concluido.');
    url.searchParams.delete('login');
    window.history.replaceState({}, document.title, url.toString());
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => {
      const current = entry[1];
      return current !== '' && (!Array.isArray(current) || current.length > 0);
    }),
  ) as Partial<T>;
}

function parseCsv(value: string): readonly string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function orderRoles(roles: Iterable<UserRole>): readonly UserRole[] {
  const values = new Set(roles);
  return (['usuario', 'portaria', 'admin'] as const).filter((role) => values.has(role));
}

function toErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const payload = (error as { error?: { error?: { message?: string } } }).error;
    if (payload?.error?.message) {
      return payload.error.message;
    }
  }

  return 'Nao foi possivel concluir a operacao.';
}
