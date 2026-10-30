import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RequestStats, ServiceRequest } from '../../models/request.model';
import { RequestService } from '../../services/request.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly requests = inject(RequestService);

  protected readonly stats = signal<RequestStats | null>(null);
  protected readonly recent = signal<ServiceRequest[]>([]);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.requests.stats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => this.error.set('Could not load the numbers.'),
    });
    this.requests.list().subscribe({
      next: (list) => this.recent.set(list.slice(0, 5)),
      error: () => this.error.set('Could not load recent requests.'),
    });
  }
}
