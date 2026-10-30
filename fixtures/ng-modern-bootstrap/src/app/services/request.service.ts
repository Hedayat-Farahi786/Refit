import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { NewServiceRequest, RequestStats, ServiceRequest } from '../models/request.model';

@Injectable({ providedIn: 'root' })
export class RequestService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api`;

  list(): Observable<ServiceRequest[]> {
    return this.http.get<ServiceRequest[]>(`${this.base}/requests`);
  }

  get(id: number): Observable<ServiceRequest> {
    return this.http.get<ServiceRequest>(`${this.base}/requests/${id}`);
  }

  create(request: NewServiceRequest): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.base}/requests`, request);
  }

  stats(): Observable<RequestStats> {
    return this.http.get<RequestStats>(`${this.base}/stats`);
  }
}
