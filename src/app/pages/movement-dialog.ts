import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Asset, Movement, today, uid } from '../core/models';
import { PortfolioService, msg } from '../core/portfolio.service';
import { StoreService } from '../core/store.service';
import { needsPaidPlan } from '../core/market-data.service';
import { Help } from '../shared/ui';
import { NumPipe } from '../shared/format';

/** Formulario para apuntar una aportación o retirada. */
@Component({
  selector: 'app-movement-dialog',
  imports: [FormsModule, Help, NumPipe],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="save()">
        <h2>{{ movement() ? 'Editar movimiento' : 'Nuevo movimiento' }} · {{ asset().name }}</h2>

        <div class="segmented">
          <button type="button" [class.on]="kind() === 'aportacion'" (click)="kind.set('aportacion')">Meto dinero</button>
          <button type="button" [class.on]="kind() === 'retirada'" (click)="kind.set('retirada')">Saco dinero</button>
        </div>

        <div class="form-grid">
          <label class="field">Fecha
            <input type="date" name="date" [(ngModel)]="date" [max]="max" required />
          </label>
          <label class="field">Importe ({{ base() }})
            <input type="number" name="amount" inputmode="decimal" min="0" step="0.01" [(ngModel)]="amount" required placeholder="Ej. 100" />
          </label>
        </div>

        @if (asset().symbol && !asset().tracking) {
          <details [open]="!!shares || !!price">
            <summary>Opcional: participaciones y precio <app-help term="Participaciones" text="Cuántas acciones o participaciones compraste. Si no lo sabes, déjalo vacío y lo calculamos con el precio de cierre de ese día." /></summary>
            <div class="form-grid" style="margin-top: 10px">
              <label class="field">Participaciones
                <input type="number" name="shares" inputmode="decimal" min="0" step="any" [(ngModel)]="shares" placeholder="Automático" />
              </label>
              <label class="field">Precio por participación ({{ asset().currency }})
                <input type="number" name="price" inputmode="decimal" min="0" step="any" [(ngModel)]="price" placeholder="Automático" />
              </label>
            </div>
            <p class="small muted">Lo más exacto es copiar las participaciones de tu bróker. Si no, usamos el precio de cierre de ese día.</p>
          </details>
        }

        <label class="field">Nota <small>(opcional)</small>
          <input name="note" [(ngModel)]="note" placeholder="Ej. aportación mensual" />
        </label>

        @if (estimated()) {
          <p class="small text-2">Calculado: {{ estimated()!.shares | num: 4 }} participaciones a {{ estimated()!.price | num: 2 }} {{ asset().currency }}.</p>
        }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

        <div class="row">
          @if (movement()) {
            <button type="button" class="btn danger" (click)="remove()">Eliminar</button>
          }
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button class="btn primary" type="submit" [disabled]="busy()">
            @if (busy()) { <span class="spinner"></span> } Guardar
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text-2); display: flex; align-items: center; }
  `,
})
export class MovementDialog implements OnInit {
  private readonly store = inject(StoreService);
  private readonly portfolio = inject(PortfolioService);
  readonly asset = input.required<Asset>();
  readonly movement = input<Movement | undefined>(undefined);
  readonly closed = output<void>();
  readonly saved = output<Movement>();
  readonly convertedToManual = output<void>();

  readonly kind = signal<'aportacion' | 'retirada'>('aportacion');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly estimated = signal<{ shares: number; price: number } | null>(null);
  readonly max = today();
  date = today();
  amount: number | null = null;
  shares: number | null = null;
  price: number | null = null;
  note = '';

  base(): string {
    return this.store.settings().baseCurrency;
  }

  ngOnInit(): void {
    const m = this.movement();
    if (m) {
      this.kind.set(m.kind);
      this.date = m.date;
      this.amount = m.amount;
      this.shares = m.shares ?? null;
      this.price = m.price ?? null;
      this.note = m.note ?? '';
    }
  }

  async save(): Promise<void> {
    this.error.set('');
    if (!this.amount || this.amount <= 0) {
      this.error.set('Escribe un importe mayor que 0.');
      return;
    }
    if (!this.date) {
      this.error.set('Elige una fecha.');
      return;
    }
    const asset = this.asset();
    // En un activo que sigue a un equivalente, las participaciones se recalculan siempre con su precio.
    let shares = asset.tracking ? undefined : (this.shares ?? undefined);
    let price = asset.tracking ? undefined : (this.price ?? undefined);
    if (asset.symbol && !shares) {
      this.busy.set(true);
      try {
        const est = await this.portfolio.estimateShares(asset, this.date, this.amount, price);
        shares = est.shares;
        price = est.price;
        this.estimated.set(est);
      } catch (e) {
        this.busy.set(false);
        if (needsPaidPlan(e)) {
          // Sin precio gratuito: pasa a valorarse a mano y la aportación se guarda solo con el importe.
          this.store.convertToManual(asset.id);
          this.convertedToManual.emit();
        } else {
          this.error.set(`No pude calcular las participaciones (${msg(e)}). Escríbelas a mano.`);
          return;
        }
      }
      this.busy.set(false);
    }
    const movement: Movement = {
      id: this.movement()?.id ?? uid(),
      date: this.date,
      kind: this.kind(),
      amount: Number(this.amount),
      shares: shares ? Number(shares) : undefined,
      price: price ? Number(price) : undefined,
      note: this.note.trim() || undefined,
    };
    this.store.saveMovement(asset.id, movement);
    this.saved.emit(movement);
    this.closed.emit();
  }

  remove(): void {
    const m = this.movement();
    if (m && confirm('¿Eliminar este movimiento?')) {
      this.store.removeMovement(this.asset().id, m.id);
      this.closed.emit();
    }
  }
}
