import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FirebaseAuthService } from './firebase-auth.service';
import { FirestoreDataService } from './firestore-data.service';

export type KeyStatus =
  | 'disponivel'
  | 'bloqueada_por_reserva'
  | 'retirada'
  | 'atrasada'
  | 'em_manutencao'
  | 'perdida'
  | 'danificada';
export type EditableKeyBaseStatus = 'disponivel' | 'em_manutencao' | 'perdida' | 'danificada';

export type UserRole = 'usuario' | 'portaria' | 'admin';
export type AppView =
  | 'operacao'
  | 'reservas'
  | 'movimentacoes'
  | 'ocorrencias'
  | 'relatorios'
  | 'administracao';
export type ReservationStatus =
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

export interface SessionResponse {
  readonly authenticated: boolean;
  readonly user: {
    readonly userId?: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly campus?: string;
  } | null;
  readonly roles: readonly UserRole[];
}

export interface Room {
  readonly id: string;
  readonly name: string;
  readonly campus?: string;
  readonly externalRefs?: readonly string[];
  readonly provisional?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
}

export interface PhysicalKey {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly baseStatus: KeyStatus;
  readonly provisional?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
}

export interface KeyRoomLink {
  readonly keyId: string;
  readonly roomId: string;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
  readonly disabledReason?: string;
}

export interface Reservation {
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

export interface ReservationSyncStatus {
  readonly scheduler: {
    readonly enabled: boolean;
    readonly running: boolean;
    readonly lastStartedAt?: string;
    readonly lastFinishedAt?: string;
    readonly nextRunAt?: string;
    readonly consecutiveFailures?: number;
    readonly lastErrorCode?: string;
    readonly lastErrorMessage?: string;
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

export interface ReservationSyncEvent {
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
  readonly writeCount?: number;
}

export interface KeyAvailability {
  readonly key: PhysicalKey;
  readonly rooms: readonly Room[];
  readonly status: KeyStatus;
  readonly blockingReservation?: {
    readonly externalId: string;
    readonly roomName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly status?: ReservationStatus;
    readonly responsibleName?: string;
    readonly responsibleIdentifier?: string;
  };
  readonly reservationAttention?: {
    readonly externalId: string;
    readonly roomName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly status: 'suspect_absent';
  };
}

export interface KeyMovement {
  readonly id: string;
  readonly keyId: string;
  readonly roomId: string;
  readonly status: 'retirada' | 'devolvida' | 'atrasada';
  readonly responsibleName: string;
  readonly responsibleIdentifier?: string;
  readonly checkedOutByName: string;
  readonly checkedOutByIdentifier?: string;
  readonly checkedOutAt: string;
  readonly expectedReturnAt?: string;
  readonly returnedByName?: string;
  readonly returnedByIdentifier?: string;
  readonly returnedAt?: string;
  readonly returnNotes?: string;
}

export interface KeyOccurrence {
  readonly id: string;
  readonly keyId: string;
  readonly roomId?: string;
  readonly type: 'ocorrencia' | 'ajuste_admin';
  readonly previousStatus: KeyStatus;
  readonly targetStatus?: KeyStatus;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly occurredAt: string;
  readonly notes: string;
}

export interface OperationalReport {
  readonly generatedAt: string;
  readonly period: {
    readonly from?: string;
    readonly to?: string;
  };
  readonly movements: {
    readonly withdrawals: number;
    readonly returns: number;
    readonly open: number;
    readonly late: number;
  };
  readonly occurrences: {
    readonly total: number;
    readonly operational: number;
    readonly adminAdjustments: number;
  };
}

export interface AppUser {
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

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatToolbarModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly firestore = inject(FirestoreDataService);

  readonly session = signal<SessionResponse | null>(null);
  readonly availability = signal<readonly KeyAvailability[]>([]);
  readonly movements = signal<readonly KeyMovement[]>([]);
  readonly movementHistory = signal<readonly KeyMovement[]>([]);
  readonly occurrences = signal<readonly KeyOccurrence[]>([]);
  readonly occurrenceHistory = signal<readonly KeyOccurrence[]>([]);
  readonly operationalReport = signal<OperationalReport | null>(null);
  readonly users = signal<readonly AppUser[]>([]);
  readonly rooms = signal<readonly Room[]>([]);
  readonly keys = signal<readonly PhysicalKey[]>([]);
  readonly keyRoomLinks = signal<readonly KeyRoomLink[]>([]);
  readonly reservations = signal<readonly Reservation[]>([]);
  readonly reservationSyncStatus = signal<ReservationSyncStatus | null>(null);
  readonly reservationSyncEvents = signal<readonly ReservationSyncEvent[]>([]);
  readonly roleDrafts = signal<Record<string, readonly UserRole[]>>({});
  readonly editingRoomId = signal<string | null>(null);
  readonly editingKeyId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal<KeyStatus | 'todas'>('todas');
  readonly reservationSearch = signal('');
  readonly reservationStatusFilter = signal<ReservationStatus | 'todas'>('todas');
  readonly userSearch = signal('');
  readonly userRoleFilter = signal<UserRole | 'todos'>('todos');
  readonly catalogSearch = signal('');
  readonly catalogStateFilter = signal<'todos' | 'ativos' | 'desativados'>('todos');
  readonly activeView = signal<AppView>('operacao');
  readonly selectedKeyId = signal<string | null>(null);

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

  movementHistoryFilter = {
    keyId: '',
    roomId: '',
    status: 'todas' as 'todas' | 'retirada' | 'devolvida' | 'atrasada',
    dateField: 'checkedOutAt' as 'checkedOutAt' | 'returnedAt',
    from: '',
    to: '',
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

  occurrenceHistoryFilter = {
    keyId: '',
    roomId: '',
    type: 'todas' as 'todas' | 'ocorrencia' | 'ajuste_admin',
    from: '',
    to: '',
  };

  reportFilter = {
    from: '',
    to: '',
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

  roomEditForm = {
    name: '',
    campus: '',
    externalRefs: '',
  };

  keyEditForm = {
    code: '',
    label: '',
    baseStatus: '' as '' | EditableKeyBaseStatus,
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
  readonly reservationCounts = computed(() => {
    const items = this.reservations();

    return {
      total: items.length,
      active: items.filter((item) => item.status === 'active').length,
      changed: items.filter((item) => item.status === 'changed').length,
      conflicted: items.filter((item) => item.status === 'conflicted').length,
      suspectAbsent: items.filter((item) => item.status === 'suspect_absent').length,
      absent: items.filter((item) => item.status === 'absent').length,
      canceled: items.filter((item) => item.status === 'canceled').length,
    };
  });
  readonly selectedAvailability = computed(() => {
    const keyId = this.selectedKeyId();
    return keyId ? this.availability().find((item) => item.key.id === keyId) ?? null : null;
  });
  readonly filteredUsers = computed(() => {
    const query = normalize(this.userSearch());
    const role = this.userRoleFilter();

    return this.users().filter((user) => {
      const text = normalize([user.id, user.displayName, user.email, user.campus].filter(Boolean).join(' '));
      return (!query || text.includes(query)) && (role === 'todos' || user.roles.includes(role));
    });
  });
  readonly filteredRooms = computed(() => {
    const query = normalize(this.catalogSearch());
    const state = this.catalogStateFilter();

    return this.rooms().filter((room) => {
      const text = normalize([room.id, room.name, room.campus, ...(room.externalRefs ?? [])].filter(Boolean).join(' '));
      return this.catalogStateMatches(room, state) && (!query || text.includes(query));
    });
  });
  readonly filteredKeys = computed(() => {
    const query = normalize(this.catalogSearch());
    const state = this.catalogStateFilter();

    return this.keys().filter((key) => {
      const text = normalize([key.id, key.code, key.label, key.baseStatus].filter(Boolean).join(' '));
      return this.catalogStateMatches(key, state) && (!query || text.includes(query));
    });
  });
  readonly filteredKeyRoomLinks = computed(() => {
    const query = normalize(this.catalogSearch());
    const state = this.catalogStateFilter();

    return this.keyRoomLinks().filter((link) => {
      const text = normalize([link.keyId, link.roomId, this.keyLabel(link.keyId), this.roomName(link.roomId)].join(' '));
      return this.catalogStateMatches(link, state) && (!query || text.includes(query));
    });
  });
  readonly reservationRoomSuggestions = computed(() => {
    const catalogNames = new Set(this.rooms().map((room) => normalize(room.name)));
    const suggestions = new Map<string, { readonly name: string; readonly campus: string }>();

    for (const reservation of this.reservations()) {
      const name = reservation.roomName.trim();
      const normalizedName = normalize(name);
      if (name && !catalogNames.has(normalizedName) && !suggestions.has(normalizedName)) {
        suggestions.set(normalizedName, { name, campus: reservation.campus ?? '' });
      }
    }

    return [...suggestions.values()]
      .sort((left, right) => left.name.localeCompare(right.name));
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
    disabledRooms: this.rooms().filter((room) => room.disabledAt).length,
    disabledKeys: this.keys().filter((key) => key.disabledAt).length,
    disabledLinks: this.keyRoomLinks().filter((link) => link.disabledAt).length,
  }));
  readonly activeRooms = computed(() => this.rooms().filter((room) => !room.disabledAt));
  readonly activeKeys = computed(() => this.keys().filter((key) => !key.disabledAt));
  readonly availableViews = computed<readonly AppViewOption[]>(() => {
    if (!this.isSignedIn()) {
      return [];
    }

    const views: AppViewOption[] = [
      { id: 'operacao', label: 'Operacao' },
    ];
    if (this.canMoveKeys()) {
      views.push(
        { id: 'movimentacoes', label: 'Movimentacoes' },
        { id: 'ocorrencias', label: 'Ocorrencias' },
        { id: 'relatorios', label: 'Relatorios' },
      );
    }
    if (this.isAdmin()) {
      views.push({ id: 'reservas', label: 'Reservas' });
      views.push({ id: 'administracao', label: 'Administracao' });
    }

    return views;
  });

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.firebaseAuth.ready;
    await this.reload();
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
        this.movementHistory.set([]);
        this.occurrences.set([]);
        this.occurrenceHistory.set([]);
        this.operationalReport.set(null);
        this.users.set([]);
        this.rooms.set([]);
        this.keys.set([]);
        this.keyRoomLinks.set([]);
        this.reservations.set([]);
        this.reservationSyncStatus.set(null);
        this.reservationSyncEvents.set([]);
        this.roleDrafts.set({});
        this.selectedKeyId.set(null);
        this.userSearch.set('');
        this.userRoleFilter.set('todos');
        this.catalogSearch.set('');
        this.catalogStateFilter.set('todos');
        return;
      }

      await this.loadOperationalData();
    } catch (error) {
      this.error.set(toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async login(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.firebaseAuth.signInWithGoogle();
      await this.reload();
    } catch (error) {
      this.error.set(toErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.firebaseAuth.signOut();
    this.session.set(null);
    this.availability.set([]);
    this.movements.set([]);
    this.movementHistory.set([]);
    this.occurrences.set([]);
    this.occurrenceHistory.set([]);
    this.operationalReport.set(null);
    this.users.set([]);
    this.rooms.set([]);
    this.keys.set([]);
    this.keyRoomLinks.set([]);
    this.reservations.set([]);
    this.reservationSyncStatus.set(null);
    this.reservationSyncEvents.set([]);
    this.roleDrafts.set({});
    this.activeView.set('operacao');
    this.selectedKeyId.set(null);
    this.userSearch.set('');
    this.userRoleFilter.set('todos');
    this.catalogSearch.set('');
    this.catalogStateFilter.set('todos');
    this.saved.set('Sessao encerrada.');
  }

  async registerWithdrawal(): Promise<void> {
    await this.submit(async () => {
      await this.firestore.registerWithdrawal({
        ...this.withdrawal,
        expectedReturnAt: this.toIsoOrEmpty(this.withdrawal.expectedReturnAt),
      });
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
      await this.firestore.registerReturn(this.returnForm);
      this.returnForm = {
        keyId: '',
        actorName: this.returnForm.actorName,
        actorIdentifier: this.returnForm.actorIdentifier,
        notes: '',
      };
      this.saved.set('Devolucao registrada.');
    });
  }

  async searchMovementHistory(): Promise<void> {
    await this.submit(async () => {
      await this.loadMovementHistory();
      this.saved.set('Historico atualizado.');
    });
  }

  async registerOccurrence(): Promise<void> {
    await this.submit(async () => {
      await this.firestore.registerOccurrence({
        ...this.occurrence,
        targetStatus: this.occurrence.targetStatus || undefined,
      });
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

  async searchOccurrenceHistory(): Promise<void> {
    await this.submit(async () => {
      await this.loadOccurrenceHistory();
      this.saved.set('Historico de ocorrencias atualizado.');
    });
  }

  async refreshOperationalReport(): Promise<void> {
    await this.submit(async () => {
      await this.loadOperationalReport();
      this.saved.set('Relatorio atualizado.');
    });
  }

  async refreshUsers(): Promise<void> {
    await this.submit(async () => {
      await this.loadUsers();
      this.saved.set('Usuarios filtrados.');
    });
  }

  async saveUserRoles(user: AppUser): Promise<void> {
    await this.submit(async () => {
      const roles = this.roleDraft(user).filter((role) => role !== 'usuario');
      await this.firestore.updateUserRoles({ userId: user.id, roles });
      this.saved.set('Perfis atualizados.');
    });
  }

  async createRoom(): Promise<void> {
    await this.submit(async () => {
      await this.firestore.createRoom({
        ...this.roomForm,
        externalRefs: parseCsv(this.roomForm.externalRefs),
      });
      this.roomForm = {
        id: '',
        name: '',
        campus: this.roomForm.campus,
        externalRefs: '',
      };
      this.saved.set('Sala cadastrada.');
    });
  }

  useReservationRoomSuggestion(suggestion: { readonly name: string; readonly campus: string }): void {
    this.roomForm = {
      ...this.roomForm,
      name: suggestion.name,
      campus: suggestion.campus || this.roomForm.campus,
    };
    this.saved.set('Nome da sala preenchido; confirme o cadastro fisico.');
  }

  async createKey(): Promise<void> {
    await this.submit(async () => {
      await this.firestore.createKey(this.keyForm);
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
      await this.firestore.createKeyRoomLink(this.keyRoomLinkForm);
      this.keyRoomLinkForm = {
        keyId: '',
        roomId: '',
      };
      this.saved.set('Vinculo cadastrado.');
    });
  }

  editRoom(room: Room): void {
    this.editingRoomId.set(room.id);
    this.roomEditForm = {
      name: room.name,
      campus: room.campus ?? '',
      externalRefs: (room.externalRefs ?? []).join(', '),
    };
  }

  cancelRoomEdit(): void {
    this.editingRoomId.set(null);
  }

  async updateRoom(room: Room): Promise<void> {
    await this.submit(async () => {
      await this.firestore.updateRoom(room.id, {
        ...this.roomEditForm,
        externalRefs: parseCsv(this.roomEditForm.externalRefs),
      });
      this.editingRoomId.set(null);
      this.saved.set('Sala atualizada.');
    });
  }

  async disableRoom(room: Room): Promise<void> {
    if (room.disabledAt || !window.confirm(`Desativar sala ${room.name}?`)) {
      return;
    }

    await this.submit(async () => {
      await this.firestore.setRoomDisabled(room.id, true);
      this.saved.set('Sala desativada.');
    });
  }

  async reactivateRoom(room: Room): Promise<void> {
    if (!room.disabledAt || !window.confirm(`Reativar sala ${room.name}?`)) {
      return;
    }

    await this.submit(async () => {
      await this.firestore.setRoomDisabled(room.id, false);
      this.saved.set('Sala reativada.');
    });
  }

  editKey(key: PhysicalKey): void {
    this.editingKeyId.set(key.id);
    this.keyEditForm = {
      code: key.code,
      label: key.label,
      baseStatus: isEditableKeyBaseStatus(key.baseStatus) ? key.baseStatus : '',
    };
  }

  cancelKeyEdit(): void {
    this.editingKeyId.set(null);
  }

  async updateKey(key: PhysicalKey): Promise<void> {
    await this.submit(async () => {
      await this.firestore.updateKey(key.id, {
        ...this.keyEditForm,
        baseStatus: this.keyEditForm.baseStatus || key.baseStatus,
      });
      this.editingKeyId.set(null);
      this.saved.set('Chave atualizada.');
    });
  }

  async disableKey(key: PhysicalKey): Promise<void> {
    if (key.disabledAt || !window.confirm(`Desativar chave ${key.code}?`)) {
      return;
    }

    await this.submit(async () => {
      await this.firestore.setKeyDisabled(key.id, true);
      this.saved.set('Chave desativada.');
    });
  }

  async reactivateKey(key: PhysicalKey): Promise<void> {
    if (!key.disabledAt || !window.confirm(`Reativar chave ${key.code}?`)) {
      return;
    }

    await this.submit(async () => {
      await this.firestore.setKeyDisabled(key.id, false);
      this.saved.set('Chave reativada.');
    });
  }

  async disableKeyRoomLink(link: KeyRoomLink): Promise<void> {
    if (
      link.disabledAt ||
      !window.confirm(`Desativar vinculo ${this.keyLabel(link.keyId)} / ${this.roomName(link.roomId)}?`)
    ) {
      return;
    }

    await this.submit(async () => {
      await this.firestore.setKeyRoomLinkDisabled(link, true);
      this.saved.set('Vinculo desativado.');
    });
  }

  async reactivateKeyRoomLink(link: KeyRoomLink): Promise<void> {
    if (
      !link.disabledAt ||
      !this.canReactivateKeyRoomLink(link) ||
      !window.confirm(`Reativar vinculo ${this.keyLabel(link.keyId)} / ${this.roomName(link.roomId)}?`)
    ) {
      return;
    }

    await this.submit(async () => {
      await this.firestore.setKeyRoomLinkDisabled(link, false);
      this.saved.set('Vinculo reativado.');
    });
  }

  selectKey(item: KeyAvailability): void {
    this.selectedKeyId.set(item.key.id);
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

  activeLabel(value: { readonly disabledAt?: string }): string {
    return value.disabledAt ? 'Desativado' : 'Ativo';
  }

  catalogStateMatches(
    value: { readonly disabledAt?: string },
    state: 'todos' | 'ativos' | 'desativados',
  ): boolean {
    return (
      state === 'todos' ||
      (state === 'ativos' && !value.disabledAt) ||
      (state === 'desativados' && !!value.disabledAt)
    );
  }

  canReactivateKeyRoomLink(link: KeyRoomLink): boolean {
    const key = this.keys().find((item) => item.id === link.keyId);
    const room = this.rooms().find((item) => item.id === link.roomId);
    return !!link.disabledAt && !!key && !!room && !key.disabledAt && !room.disabledAt;
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
    const firebaseUser = this.firebaseAuth.user();
    if (!firebaseUser) {
      this.session.set({ authenticated: false, user: null, roles: [] });
      return;
    }

    const profile = await this.firestore.getCurrentUserProfile();
    const session: SessionResponse = {
      authenticated: true,
      user: {
        userId: firebaseUser.uid,
        displayName: firebaseUser.displayName ?? profile?.displayName,
        email: firebaseUser.email ?? profile?.email,
        campus: profile?.campus,
      },
      roles: profile?.roles ?? [],
    };
    this.session.set(session);

    const operatorName = session.user?.displayName || session.user?.email || session.user?.userId || 'Portaria';
    const operatorIdentifier = session.user?.email || session.user?.userId || '';
    this.withdrawal.actorName ||= operatorName;
    this.withdrawal.actorIdentifier ||= operatorIdentifier;
    this.returnForm.actorName ||= operatorName;
    this.returnForm.actorIdentifier ||= operatorIdentifier;
    this.occurrence.actorName ||= operatorName;
    this.occurrence.actorIdentifier ||= operatorIdentifier;
  }

  private async loadAvailability(): Promise<void> {
    this.availability.set(await this.firestore.listAvailability());
  }

  private async loadMovements(): Promise<void> {
    this.movements.set(
      (await this.firestore.listMovements()).filter(
        (movement) => movement.status === 'retirada' || movement.status === 'atrasada',
      ),
    );
  }

  private async loadMovementHistory(): Promise<void> {
    if (!this.canMoveKeys()) {
      this.movementHistory.set([]);
      return;
    }

    const filter = this.movementHistoryFilter;
    const from = filter.from ? this.toIsoOrEmpty(filter.from) : '';
    const to = filter.to ? this.toIsoOrEmpty(filter.to) : '';
    this.movementHistory.set(
      (await this.firestore.listMovements()).filter((movement) => {
        const date = filter.dateField === 'returnedAt' ? movement.returnedAt : movement.checkedOutAt;
        return (
          (!filter.keyId || movement.keyId === filter.keyId) &&
          (!filter.roomId || movement.roomId === filter.roomId) &&
          (filter.status === 'todas' || movement.status === filter.status) &&
          (!from || !!date && date >= from) &&
          (!to || !!date && date <= to)
        );
      }),
    );
  }

  private async loadOccurrences(): Promise<void> {
    this.occurrences.set((await this.firestore.listOccurrences()).slice(0, 20));
  }

  private async loadOccurrenceHistory(): Promise<void> {
    if (!this.canMoveKeys()) {
      this.occurrenceHistory.set([]);
      return;
    }

    const filter = this.occurrenceHistoryFilter;
    const from = filter.from ? this.toIsoOrEmpty(filter.from) : '';
    const to = filter.to ? this.toIsoOrEmpty(filter.to) : '';
    this.occurrenceHistory.set(
      (await this.firestore.listOccurrences()).filter((occurrence) =>
        (!filter.keyId || occurrence.keyId === filter.keyId) &&
        (!filter.roomId || occurrence.roomId === filter.roomId) &&
        (filter.type === 'todas' || occurrence.type === filter.type) &&
        (!from || occurrence.occurredAt >= from) &&
        (!to || occurrence.occurredAt <= to),
      ),
    );
  }

  private async loadOperationalReport(): Promise<void> {
    if (!this.canMoveKeys()) {
      this.operationalReport.set(null);
      return;
    }

    this.operationalReport.set(
      await this.firestore.buildReport(
        this.reportFilter.from ? this.toIsoOrEmpty(this.reportFilter.from) : undefined,
        this.reportFilter.to ? this.toIsoOrEmpty(this.reportFilter.to) : undefined,
      ),
    );
  }

  private async loadReservations(): Promise<void> {
    this.reservations.set(await this.firestore.listReservations());
  }

  private async loadReservationSyncStatus(): Promise<void> {
    if (!this.isAdmin()) {
      this.reservationSyncStatus.set(null);
      this.reservationSyncEvents.set([]);
      return;
    }

    const [status, events] = await Promise.all([
      this.firestore.getSyncStatus(),
      this.firestore.listSyncEvents(),
    ]);
    this.reservationSyncStatus.set(status);
    this.reservationSyncEvents.set(events as readonly ReservationSyncEvent[]);
  }

  private async loadUsers(): Promise<void> {
    if (!this.isAdmin()) {
      this.users.set([]);
      this.roleDrafts.set({});
      this.rooms.set([]);
      this.keys.set([]);
      this.keyRoomLinks.set([]);
      this.reservationSyncStatus.set(null);
      this.reservationSyncEvents.set([]);
      return;
    }

    const [allUsers, rooms, keys, links] = await Promise.all([
      this.firestore.listUsers(),
      this.firestore.listRooms(),
      this.firestore.listKeys(),
      this.firestore.listKeyRoomLinks(),
    ]);
    const search = normalize(this.userSearch());
    const role = this.userRoleFilter();
    const users = allUsers.filter((user) =>
      (!search || normalize([user.id, user.displayName, user.email, user.campus].filter(Boolean).join(' ')).includes(search)) &&
      (role === 'todos' || user.roles.includes(role)),
    );
    this.users.set(users);
    this.rooms.set(rooms);
    this.keys.set(keys);
    this.keyRoomLinks.set(links);
    this.roleDrafts.set(Object.fromEntries(users.map((user) => [user.id, orderRoles(user.roles)])));
  }

  private async loadOperationalData(): Promise<void> {
    const tasks = [this.loadAvailability()];

    if (this.canMoveKeys()) {
      tasks.push(this.loadReservations());
    } else {
      this.reservations.set([]);
    }

    if (this.canMoveKeys()) {
      tasks.push(
        this.loadMovements(),
        this.loadMovementHistory(),
        this.loadOccurrences(),
        this.loadOccurrenceHistory(),
        this.loadOperationalReport(),
      );
    } else {
      this.movements.set([]);
      this.movementHistory.set([]);
      this.occurrences.set([]);
      this.occurrenceHistory.set([]);
      this.operationalReport.set(null);
    }

    await Promise.all(tasks);
    await Promise.all([this.loadUsers(), this.loadReservationSyncStatus()]);
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

function isEditableKeyBaseStatus(status: KeyStatus): status is EditableKeyBaseStatus {
  return (
    status === 'disponivel' ||
    status === 'em_manutencao' ||
    status === 'perdida' ||
    status === 'danificada'
  );
}

function toErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const payload = (error as { error?: { error?: { message?: string } } }).error;
    if (payload?.error?.message) {
      return payload.error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Nao foi possivel concluir a operacao no Firestore.';
}
