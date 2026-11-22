import { Icon } from './icon';
import { Component, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RANGE_OPTIONS, RangeKey } from '../core/ranges';
import { addDays, today } from '../core/models';

/** Botones para elegir el tramo del gráfico: 1D, 1S, 1M... o fechas personalizadas. */
@Component({
  selector: 'app-range-selector',
  imports: [FormsModule],
  template: `
    <div class="ranges" role="tablist" aria-label="Periodo del gráfico">
      @for (r of options(); track r.key) {
        <button type="button" role="tab" [attr.aria-selected]="value() === r.key" [class.on]="value() === r.key" [title]="r.title" (click)="pick(r.key)">
          {{ r.label }}
        </button>
      }
    </div>
    @if (value() === 'CUSTOM') {
      <div class="custom">
        <label>Desde <input type="date" [ngModel]="from()" (ngModelChange)="from.set($event); emitCustom()" [max]="to()" /></label>
        <label>Hasta <input type="date" [ngModel]="to()" (ngModelChange)="to.set($event); emitCustom()" [min]="from()" [max]="max" /></label>
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; max-width: 100%; }
    .ranges { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; background: var(--chip); border-radius: 6px; padding: 3px; width: fit-content; max-width: 100%; }
    @media (max-width: 600px) {
      .ranges { width: 100%; }
      .ranges button { flex: 1 0 auto; padding: 7px 4px; font-size: 12px; min-height: 32px; }
      .custom label { flex: 1; }
    }
    .ranges::-webkit-scrollbar { display: none; }
    button { border: 0; background: transparent; color: var(--text-2); font: inherit; font-size: 13px; font-weight: 600; padding: 6px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap; min-height: 32px; }
    button:hover { color: var(--text); }
    button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
    .custom { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: var(--text-2); }
    .custom label { display: flex; align-items: center; gap: 6px; }
    .custom input { padding: 6px 8px; }
  `,
})
export class RangeSelector {
  readonly value = model<RangeKey>('1A');
  readonly exclude = input<RangeKey[]>([]);
  readonly customChange = output<{ from: string; to: string }>();
  readonly max = today();
  readonly from = signal(addDays(today(), -90));
  readonly to = signal(today());

  options() {
    return RANGE_OPTIONS.filter((o) => !this.exclude().includes(o.key));
  }

  pick(key: RangeKey): void {
    this.value.set(key);
    if (key === 'CUSTOM') this.emitCustom();
  }

  emitCustom(): void {
    if (this.from() && this.to() && this.from() <= this.to()) this.customChange.emit({ from: this.from(), to: this.to() });
  }
}

/** Botón "?" que explica un término en lenguaje sencillo. */
@Component({
  selector: 'app-help',
  template: `
    <button type="button" class="q" [attr.aria-expanded]="open()" [attr.aria-label]="'¿Qué significa ' + term() + '?'" (click)="open.set(!open())">?</button>
    @if (open()) {
      <span class="pop" role="note"><strong>{{ term() }}:</strong> {{ text() }}</span>
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; vertical-align: middle; }
    .q { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border); background: var(--chip); color: var(--text-2); font-size: 11px; font-weight: 700; cursor: pointer; padding: 0; line-height: 1; margin-left: 4px; }
    .pop { position: absolute; z-index: 30; top: 24px; left: -60px; width: min(260px, 70vw); background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 13px; font-weight: 400; line-height: 1.45; box-shadow: var(--shadow); text-transform: none; letter-spacing: 0; }
  `,
  host: { '(document:click)': 'close($event)' },
})
export class Help {
  readonly term = input.required<string>();
  readonly text = input.required<string>();
  readonly open = signal(false);

  close(e: Event): void {
    if (this.open() && !(e.target as HTMLElement).closest('app-help')) this.open.set(false);
  }
}

/** Aviso cuando falta configurar algo (claves de API). */
@Component({
  selector: 'app-notice',
  imports: [Icon],
  template: `<div class="notice" [class]="level()"><app-icon class="icon" [name]="icon()" [size]="18" /><div><ng-content /></div></div>`,
  styles: `
    .notice { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 8px; font-size: 14px; line-height: 1.45; background: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .notice.warning { border-left: 3px solid var(--warning); } .notice.warning .icon { color: #b07d00; }
    .notice.critical { border-left: 3px solid var(--critical); } .notice.critical .icon { color: var(--loss); }
    .notice.good { border-left: 3px solid var(--good); } .notice.good .icon { color: var(--gain); }
    .notice.info { border-left: 3px solid var(--text-2); } .notice.info .icon { color: var(--text-2); }
    .icon { margin-top: 1px; }
  `,
})
export class Notice {
  readonly level = input<'info' | 'warning' | 'critical' | 'good'>('info');
  icon(): string {
    return { info: 'info', warning: 'alert', critical: 'alert', good: 'check' }[this.level()];
  }
}
