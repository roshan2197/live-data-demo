import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LiveDataService, ModuleRecord } from '../../services/live-data.service';
import { Subject, takeUntil } from 'rxjs';
import { ModuleConfig, ModuleField, ModuleKey, MODULES } from '../../config/modules';

@Component({
  selector: 'app-live-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './live-table.component.html',
  styleUrls: ['./live-table.component.scss']
})
export class LiveTableComponent implements OnInit, OnDestroy {
  @Input() moduleKey!: ModuleKey;
  data: ModuleRecord[] = [];
  blinkingCells = new Set<string>();
  blinkingRows = new Set<number>();
  private destroy$ = new Subject<void>();
  connectionStatus: 'connected' | 'disconnected' = 'disconnected';
  isDarkMode = true; // Start with dark mode
  moduleConfig!: ModuleConfig;
  gridFields: ModuleField[] = [];

  constructor(private liveDataService: LiveDataService) {}

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
  }

  ngOnInit() {
    this.moduleConfig = MODULES[this.moduleKey];
    this.gridFields = this.moduleConfig.gridFields;
    this.liveDataService.setModule(this.moduleKey);

    // Subscribe to data changes
    this.liveDataService.data$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: ModuleRecord[]) => {
        this.data = data;
      });

    // Subscribe to blinking cells
    this.liveDataService.blinkingCells$
      .pipe(takeUntil(this.destroy$))
      .subscribe((cells: Set<string>) => {
        this.blinkingCells = cells;
      });

    // Subscribe to blinking rows
    this.liveDataService.blinkingRows$
      .pipe(takeUntil(this.destroy$))
      .subscribe((rows: Set<number>) => {
        this.blinkingRows = rows;
      });

    // Check connection status
    const socket = this.liveDataService.getSocket();
    this.connectionStatus = socket.connected ? 'connected' : 'disconnected';

    socket.on('connect', () => {
      this.connectionStatus = 'connected';
    });

    socket.on('disconnect', () => {
      this.connectionStatus = 'disconnected';
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Check if cell is blinking
  isCellBlinking(id: number, field: string): boolean {
    return this.blinkingCells.has(`cell-${id}-${field}`);
  }

  // Check if row is blinking
  isRowBlinking(id: number): boolean {
    return this.blinkingRows.has(id);
  }

  // Manually trigger animations for demo
  triggerCellBlink(id: number, field: string) {
    this.liveDataService.blinkCell(id, field);
  }

  triggerRowBlink(id: number) {
    this.liveDataService.blinkRow(id);
  }

  getStatusBgClass(status: string): string {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('pending')) return 'bg-amber-500 text-white';
    if (normalized.includes('approved')) return 'bg-sky-600 text-white';
    if (normalized.includes('completed')) return 'bg-emerald-600 text-white';
    if (normalized.includes('canceled') || normalized.includes('inactive') || normalized.includes('discontinued')) {
      return 'bg-rose-600 text-white';
    }
    if (normalized.includes('active')) return 'bg-emerald-600 text-white';
    if (normalized.includes('prospect') || normalized.includes('draft')) return 'bg-indigo-500 text-white';
    return 'bg-slate-600 text-white';
  }

  formatValue(record: ModuleRecord, field: ModuleField) {
    const value = record[field.key];
    if (field.type === 'currency') {
      return Number(value ?? 0).toFixed(2);
    }
    if (field.type === 'date') {
      return value ? new Date(value).toLocaleString() : 'N/A';
    }
    return value ?? '—';
  }
}
