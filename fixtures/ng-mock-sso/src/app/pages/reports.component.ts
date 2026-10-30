import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-reports',
  template: `
    <h2>Reports</h2>
    <table border="1" cellpadding="4">
      <tr><th>Name</th><th>Category</th></tr>
      @for (product of products(); track product.id) {
        <tr><td>{{ product.name }}</td><td>{{ product.category }}</td></tr>
      }
    </table>
  `,
})
export class ReportsComponent {
  protected readonly products = signal<Array<{ id: number; name: string; category: string }>>([]);

  constructor() {
    inject(HttpClient)
      .get<Array<{ id: number; name: string; category: string }>>(`${environment.apiBase}/api/products`)
      .subscribe({ next: (products) => this.products.set(products), error: () => this.products.set([]) });
  }
}
