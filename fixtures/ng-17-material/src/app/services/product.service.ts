import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private http: HttpClient) {}

  products(): Observable<Product[]> {
    return this.http.get<Product[]>(`${environment.apiBase}/api/products`);
  }

  user(id: number): Observable<User> {
    return this.http.get<User>(`${environment.apiBase}/api/users/${id}`);
  }
}
