import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RequestStatus, ServiceRequest } from '../../models/request.model';
import { RequestService } from '../../services/request.service';

@Component({
  selector: 'app-request-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './request-list.component.html',
  styleUrl: './request-list.component.scss',
})
export class RequestListComponent implements OnInit {
  private readonly requests = inject(RequestService);
  private readonly router = inject(Router);

  protected readonly all = signal<ServiceRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected statusFilter: RequestStatus | '' = '';
  private readonly filter = signal<RequestStatus | ''>('');

  protected readonly visible = computed(() => {
    const status = this.filter();
    return status ? this.all().filter((request) => request.status === status) : this.all();
  });

  ngOnInit(): void {
    this.requests.list().subscribe({
      next: (list) => {
        this.all.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load requests.');
        this.loading.set(false);
      },
    });
  }

  applyFilter(): void {
    this.filter.set(this.statusFilter);
  }

  open(request: ServiceRequest): void {
    void this.router.navigate(['/requests', request.id]);
  }
}
