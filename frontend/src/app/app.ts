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

interface SessionResponse {
  readonly authenticated: boolean;
  readonly user: {
    readonly userId?: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly campus?: string;
  } | null;
  readonly roles: readonly string[];
}

interface Room {
  readonly id: string;
  readonly name: string;
  readonly campus?: string;
}

interface PhysicalKey {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly baseStatus: KeyStatus;
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
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal<KeyStatus | 'todas'>('todas');

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

  readonly isAdmin = computed(() => this.session()?.roles.includes('admin') ?? false);
  readonly isSignedIn = computed(() => this.session()?.authenticated ?? false);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.loadSession();
      await Promise.all([this.loadAvailability(), this.loadMovements(), this.loadOccurrences()]);
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

  selectKey(item: KeyAvailability): void {
    this.withdrawal.keyId = item.key.id;
    this.withdrawal.roomId = item.rooms[0]?.id ?? '';
    this.returnForm.keyId = item.key.id;
    this.occurrence.keyId = item.key.id;
    this.occurrence.roomId = item.rooms[0]?.id ?? '';
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
      await Promise.all([this.loadAvailability(), this.loadMovements(), this.loadOccurrences()]);
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

  private url(path: string): string {
    const base = this.apiBase().trim().replace(/\/$/, '');
    return base ? `${base}${path}` : path;
  }

  private toIsoOrEmpty(value: string): string {
    return value ? new Date(value).toISOString() : '';
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
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== '')) as Partial<T>;
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
