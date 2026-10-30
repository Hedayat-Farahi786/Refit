import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Brand } from '@refit/shared';
import { brandContrast, generatePalette, normalizeBrand, SHADES, SURFACE_PALETTES } from '@refit/shared';
import { ConfirmationService, type MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { Api } from '../../core/api';
import { AppState } from '../../core/app-state';
import { relativeTime } from '../../core/format';
import { Notify } from '../../core/notify';
import { brandFiles, downloadText, readBrandFile } from './brand-files';

/** A new brand starts neutral, so it is obvious what to change first. */
const NEW_BRAND: Omit<Brand, 'id'> = {
  ...normalizeBrand({ id: 'new' }),
  name: 'New brand',
  status: 'draft',
  note: '',
  primary: '#2563eb',
  surface: 'slate',
  radius: 6,
};

@Component({
  selector: 'app-brands-page',
  imports: [RouterLink, Button, Menu],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1 class="display">Brands</h1>
          <p class="lede">The look Refit gives the apps it modernizes: colors, type, corners and density, turned into a PrimeNG preset, CSS variables and a usage guide.</p>
        </div>
        <div class="cluster">
          <input #importInput type="file" accept=".json,application/json" class="sr-only" tabindex="-1" aria-hidden="true" (change)="importFile(importInput)" />
          <p-button label="Import" icon="pi pi-upload" severity="secondary" [outlined]="true" (onClick)="importInput.click()" />
          <p-button label="New brand" icon="pi pi-plus" [loading]="creating()" (onClick)="create()" />
        </div>
      </header>

      <ul class="grid" role="list">
        @for (brand of brands(); track brand.id) {
          <li class="card">
            <a class="card-link" [routerLink]="['/brands', brand.id]" [attr.aria-label]="'Open ' + brand.name"></a>
            <div class="swatch" [style.background]="brand.primary" aria-hidden="true">
              <span class="swatch-label" [style.color]="onPrimary(brand)">Aa</span>
            </div>
            <div class="strip" aria-hidden="true">
              @for (color of scale(brand); track $index) {
                <span [style.background]="color"></span>
              }
            </div>
            <div class="strip surface" aria-hidden="true">
              @for (color of surface(brand); track $index) {
                <span [style.background]="color"></span>
              }
            </div>
            <div class="body">
              <div class="title-row">
                <span class="name truncate">{{ brand.name }}</span>
                <p-button icon="pi pi-ellipsis-h" [text]="true" severity="secondary" size="small" [ariaLabel]="'Actions for ' + brand.name" (onClick)="openMenu(menu, $event, brand)" />
              </div>
              <div class="cluster tags">
                <span class="pill" [class.ok]="brand.status === 'approved'" [class.warn]="brand.status === 'draft'">{{ brand.status === 'approved' ? 'Approved' : 'Draft' }}</span>
                @if (brand.id === defaultId()) {
                  <span class="pill info">Default</span>
                }
              </div>
              <dl class="facts">
                <div><dt>Color</dt><dd class="mono">{{ brand.primary }}</dd></div>
                <div><dt>Corners</dt><dd>{{ brand.radius }} px</dd></div>
                <div><dt>Density</dt><dd>{{ brand.density === 'compact' ? 'Compact' : 'Comfortable' }}</dd></div>
              </dl>
              <span class="muted tiny">Updated {{ ago(brand.updatedAt) }}</span>
            </div>
          </li>
        }
      </ul>
    </div>
    <p-menu #menu [model]="menuItems()" [popup]="true" appendTo="body" />
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-xl);
      background: var(--refit-panel);
      overflow: hidden;
      box-shadow: var(--refit-shadow-card);
      transition: box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease;
    }
    .card:hover {
      border-color: var(--refit-border-strong);
      box-shadow: var(--refit-shadow-float);
      transform: translateY(-1px);
    }
    .card:has(.card-link:focus-visible) {
      outline: 2px solid var(--refit-accent);
      outline-offset: 2px;
    }
    .card-link {
      position: absolute;
      inset: 0;
      z-index: 1;
      outline: none;
    }
    .swatch {
      height: 104px;
      display: flex;
      align-items: flex-end;
      padding: 14px 18px;
    }
    .swatch-label {
      font-size: 1.6rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .strip {
      display: grid;
      grid-template-columns: repeat(11, 1fr);
      height: 10px;
    }
    .strip.surface {
      height: 8px;
    }
    .body {
      padding: 14px 18px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .title-row p-button {
      position: relative;
      z-index: 2;
      margin-right: -8px;
    }
    .name {
      font-weight: 600;
      font-size: 1.05rem;
    }
    .tags {
      --cluster-gap: 6px;
    }
    .facts {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      gap: 4px 24px;
      margin: 4px 0;
    }
    .facts dt {
      font-size: 0.72rem;
      color: var(--refit-muted);
    }
    .facts dd {
      font-size: 0.875rem;
      font-weight: 500;
    }
  `,
})
export class BrandsPage {
  protected readonly state = inject(AppState);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);

  protected readonly creating = signal(false);
  protected readonly brands = computed(() => [...this.state.brands()].sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly defaultId = computed(() => this.state.defaultBrand()?.id ?? null);
  private readonly menuBrand = signal<Brand | null>(null);

  protected readonly menuItems = computed<MenuItem[]>(() => {
    const brand = this.menuBrand();
    if (!brand) return [];
    return [
      { label: 'Open', icon: 'pi pi-pencil', command: () => void this.router.navigate(['/brands', brand.id]) },
      { label: 'Duplicate', icon: 'pi pi-copy', command: () => void this.duplicate(brand) },
      { label: 'Use for new runs', icon: 'pi pi-star', disabled: brand.id === this.defaultId(), command: () => void this.makeDefault(brand) },
      { label: 'Export brand file', icon: 'pi pi-download', command: () => this.export(brand) },
      { separator: true },
      { label: 'Delete', icon: 'pi pi-trash', disabled: this.state.brands().length < 2, command: () => this.remove(brand) },
    ];
  });

  protected openMenu(menu: Menu, event: Event, brand: Brand): void {
    this.menuBrand.set(brand);
    menu.toggle(event);
  }

  protected scale(brand: Brand): string[] {
    const palette = generatePalette(brand.primary);
    return SHADES.map((shade) => palette[shade]);
  }

  protected surface(brand: Brand): string[] {
    const palette = SURFACE_PALETTES[brand.surface];
    return ['#ffffff', ...SHADES.slice(0, 10).map((shade) => palette[shade])];
  }

  /** The same text color the generated preset puts on primary buttons. */
  protected onPrimary(brand: Brand): string {
    return brandContrast(brand).onPrimary === 'white' ? '#ffffff' : SURFACE_PALETTES[brand.surface]['950'];
  }

  protected ago(iso: string | undefined): string {
    return iso ? relativeTime(iso) : 'never';
  }

  protected async create(): Promise<void> {
    this.creating.set(true);
    try {
      const brand = await this.api.createBrand(NEW_BRAND);
      this.state.refresh();
      await this.router.navigate(['/brands', brand.id]);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.creating.set(false);
    }
  }

  protected async duplicate(brand: Brand): Promise<void> {
    try {
      const { id: _id, updatedAt: _updatedAt, ...rest } = brand;
      const copy = await this.api.createBrand({ ...rest, name: `${brand.name} copy`, status: 'draft' });
      this.notify.success('Brand duplicated', copy.name);
      this.state.refresh();
      await this.router.navigate(['/brands', copy.id]);
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async makeDefault(brand: Brand): Promise<void> {
    try {
      await this.api.saveSettings({ defaultBrandId: brand.id });
      this.notify.success('Default brand set', `New runs use ${brand.name}.`);
      this.state.refresh();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected export(brand: Brand): void {
    const file = brandFiles(brand).find((candidate) => candidate.kind === 'json')!;
    downloadText(file.name, file.content);
  }

  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const brand = await this.api.createBrand(await readBrandFile(file));
      this.notify.success('Brand imported', brand.name);
      this.state.refresh();
      await this.router.navigate(['/brands', brand.id]);
    } catch (error) {
      this.notify.error(error, 'Could not import the brand');
    }
  }

  protected remove(brand: Brand): void {
    this.confirm.confirm({
      header: `Delete ${brand.name}?`,
      message: 'Runs that used it keep their results. This cannot be undone.',
      icon: 'pi pi-trash',
      acceptLabel: 'Delete brand',
      rejectLabel: 'Keep it',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          await this.api.deleteBrand(brand.id);
          this.notify.success('Brand deleted', brand.name);
          this.state.refresh();
        } catch (error) {
          this.notify.error(error);
        }
      },
    });
  }
}
