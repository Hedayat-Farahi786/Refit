import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ApiError,
  AppRecord,
  AppSource,
  Brand,
  ChangedFile,
  CommandOverrides,
  EditableConfig,
  PageConfig,
  ProviderId,
  ProviderStatus,
  ProviderTestResult,
  PullRequestResult,
  RunRecord,
  RunSettings,
  StateResponse,
  UiSettings,
} from '@refit/shared';

/** A failed request, with the server's plain-language message and suggested fix. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly fix: string | undefined,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface FolderInspection {
  ok: boolean;
  message?: string;
  warning?: string;
  git?: boolean;
  angular?: string | null;
  suggestedName?: string;
}

export interface AppPatch {
  name?: string;
  port?: number;
  pages?: PageConfig[];
  overrides?: CommandOverrides;
  subdir?: string;
}

/** Typed access to Refit's REST API. Every method throws RequestError on failure. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  state(): Promise<StateResponse> {
    return this.request(this.http.get<StateResponse>('/api/state'));
  }

  addApp(input: { name: string; source: AppSource; port: number }): Promise<AppRecord> {
    return this.request(this.http.post<AppRecord>('/api/apps', input));
  }

  updateApp(id: string, patch: AppPatch): Promise<AppRecord> {
    return this.request(this.http.patch<AppRecord>(`/api/apps/${id}`, patch));
  }

  removeApp(id: string): Promise<void> {
    return this.request(this.http.delete<void>(`/api/apps/${id}`));
  }

  scanApp(id: string): Promise<AppRecord> {
    return this.request(this.http.post<AppRecord>(`/api/apps/${id}/scan`, {}));
  }

  inspectFolder(path: string): Promise<FolderInspection> {
    return this.request(this.http.get<FolderInspection>('/api/inspect-folder', { params: { path } }));
  }

  saveBrand(brand: Brand): Promise<Brand> {
    return this.request(this.http.put<Brand>(`/api/brands/${brand.id}`, brand));
  }

  /** Creates a brand (new, duplicate or import); the server picks a unique ID from the name. */
  createBrand(brand: Omit<Brand, 'id'> & { id?: string }): Promise<Brand> {
    return this.request(this.http.post<Brand>('/api/brands', brand));
  }

  deleteBrand(id: string): Promise<void> {
    return this.request(this.http.delete<void>(`/api/brands/${id}`));
  }

  saveSettings(settings: Pick<UiSettings, 'defaultBrandId'>): Promise<UiSettings> {
    return this.request(this.http.put<UiSettings>('/api/settings', settings));
  }

  saveConfig(config: EditableConfig): Promise<EditableConfig> {
    return this.request(this.http.put<EditableConfig>('/api/config', config));
  }

  providers(): Promise<ProviderStatus[]> {
    return this.request(this.http.get<ProviderStatus[]>('/api/providers'));
  }

  testProvider(id: ProviderId): Promise<ProviderTestResult> {
    return this.request(this.http.post<ProviderTestResult>(`/api/providers/${id}/test`, {}));
  }

  startRun(appId: string, settings: Partial<RunSettings>): Promise<RunRecord> {
    return this.request(this.http.post<RunRecord>(`/api/apps/${appId}/runs`, settings));
  }

  startReview(appId: string, provider: string): Promise<RunRecord> {
    return this.request(this.http.post<RunRecord>(`/api/apps/${appId}/review`, { provider }));
  }

  run(runId: string): Promise<RunRecord> {
    return this.request(this.http.get<RunRecord>(`/api/runs/${runId}`));
  }

  cancelRun(runId: string): Promise<void> {
    return this.request(this.http.post<void>(`/api/runs/${runId}/cancel`, {}));
  }

  runChanges(runId: string): Promise<ChangedFile[]> {
    return this.request(this.http.get<ChangedFile[]>(`/api/runs/${runId}/changes`));
  }

  runDiff(runId: string, file: string): Promise<{ file: string; diff: string }> {
    return this.request(this.http.get<{ file: string; diff: string }>(`/api/runs/${runId}/diff`, { params: { file } }));
  }

  /** Pushes the run's branch and opens the pull request where Refit can. Only on an explicit click. */
  createPullRequest(runId: string): Promise<PullRequestResult> {
    return this.request(this.http.post<PullRequestResult>(`/api/runs/${runId}/pull-request`, {}));
  }

  runReport(runId: string): Promise<string> {
    return this.request(this.http.get(`/api/runs/${runId}/report`, { responseType: 'text' }));
  }

  removeRunWorkspace(runId: string): Promise<void> {
    return this.request(this.http.delete<void>(`/api/runs/${runId}/workspace`));
  }

  openSignIn(url?: string): Promise<void> {
    return this.request(this.http.post<void>('/api/browser/sign-in', url ? { url } : {}));
  }

  finishSignIn(): Promise<{ lastSignInAt: string }> {
    return this.request(this.http.post<{ lastSignInAt: string }>('/api/browser/sign-in/done', {}));
  }

  removeRun(runId: string): Promise<void> {
    return this.request(this.http.delete<void>(`/api/runs/${runId}`));
  }

  private async request<T>(observable: import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(observable, { defaultValue: undefined as T });
    } catch (error) {
      throw toRequestError(error);
    }
  }
}

export function toRequestError(error: unknown): RequestError {
  if (error instanceof RequestError) return error;
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new RequestError('Refit is not responding.', 'Check that Refit is still running in its terminal, then try again.', 0);
    }
    const body = error.error as Partial<ApiError> | null;
    if (body && typeof body.error === 'string') return new RequestError(body.error, body.fix, error.status);
    return new RequestError(`The request failed (${error.status} ${error.statusText}).`, 'Try again.', error.status);
  }
  return new RequestError(error instanceof Error ? error.message : String(error), undefined, 0);
}
