import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { LiveDataService, ModuleRecord } from '../../services/live-data.service';
import { ModuleConfig, ModuleField, ModuleKey, MODULES } from '../../config/modules';

@Component({
  selector: 'app-form-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './form-page.component.html',
  styleUrl: './form-page.component.scss'
})
export class FormPageComponent implements OnInit, OnDestroy {
  data: ModuleRecord[] = [];
  selectedId: number | null = null;
  saving = false;
  lastLiveUpdate: string | null = null;

  moduleKey!: ModuleKey;
  moduleConfig!: ModuleConfig;
  formFields: ModuleField[] = [];
  statusOptions: string[] = [];

  form: FormGroup = this.fb.group({
    id: [null as number | null]
  });

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private liveDataService: LiveDataService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const moduleKey = this.route.snapshot.data['module'] as ModuleKey;
    this.moduleKey = moduleKey;
    this.moduleConfig = MODULES[moduleKey];
    this.formFields = this.moduleConfig.formFields;
    this.statusOptions = this.moduleConfig.statusOptions;

    this.buildForm();
    this.liveDataService.setModule(this.moduleKey);

    this.liveDataService.data$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: ModuleRecord[]) => {
        this.data = data;
        if (!this.selectedId && data.length > 0) {
          this.selectRecord(data[0].id);
          return;
        }

        if (this.selectedId) {
          const record = data.find(item => item.id === this.selectedId);
          if (record) {
            this.patchForm(record, true);
          }
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildForm() {
    const group: Record<string, any> = { id: [null] };
    this.formFields.forEach((field) => {
      const validators = field.required ? [Validators.required] : [];
      let defaultValue: any = '';
      if (field.type === 'number' || field.type === 'currency') {
        defaultValue = 0;
      }
      if (field.type === 'status') {
        defaultValue = this.statusOptions[0] || '';
      }
      group[field.key] = [defaultValue, validators];
    });
    this.form = this.fb.group(group);
  }

  selectRecord(id: number) {
    this.selectedId = id;
    const record = this.data.find(item => item.id === id);
    if (record) {
      this.patchForm(record, false);
    }
  }

  createNew() {
    this.selectedId = null;
    const resetValue: Record<string, any> = { id: null };
    this.formFields.forEach((field) => {
      resetValue[field.key] = field.type === 'status' ? this.statusOptions[0] : '';
      if (field.type === 'number' || field.type === 'currency') {
        resetValue[field.key] = 0;
      }
    });
    this.form.reset(resetValue);
    this.lastLiveUpdate = null;
  }

  save() {
    if (this.form.invalid || this.saving) return;

    const value = this.form.getRawValue();
    const payload: Record<string, any> = {};
    this.formFields.forEach((field) => {
      payload[field.key] =
        field.type === 'date'
          ? this.normalizeDateValue(value[field.key])
          : value[field.key];
    });

    this.saving = true;

    const request$ = value.id
      ? this.liveDataService.updateRecord(this.moduleKey, value.id, payload)
      : this.liveDataService.createRecord(this.moduleKey, payload);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.form.markAsPristine();
      },
      error: (err) => {
        console.error('Save failed', err);
        this.saving = false;
      }
    });
  }

  private patchForm(record: ModuleRecord, fromLiveUpdate: boolean) {
    const patchValue: Record<string, any> = { id: record.id };
    this.formFields.forEach((field) => {
      patchValue[field.key] =
        field.type === 'date'
          ? this.normalizeDateValue(record[field.key])
          : record[field.key];
    });

    this.form.patchValue(patchValue, { emitEvent: false });

    if (fromLiveUpdate) {
      this.lastLiveUpdate = new Date().toLocaleTimeString();
    }
  }

  getListTitle(record: ModuleRecord) {
    return record[this.moduleConfig.listTitleKey] ?? '—';
  }

  getListSubtitle(record: ModuleRecord) {
    const subtitle = record[this.moduleConfig.listSubtitleKey];
    return subtitle ? `${subtitle} • ${record.status ?? ''}` : record.status ?? '';
  }

  private normalizeDateValue(value: unknown): string {
    if (!value) return '';

    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
      }

      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
      }
    }

    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }
}
