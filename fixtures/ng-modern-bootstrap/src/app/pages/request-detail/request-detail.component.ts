import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ServiceRequest } from '../../models/request.model';
import { RequestService } from '../../services/request.service';

@Component({
  selector: 'app-request-detail',
  imports: [RouterLink],
  templateUrl: './request-detail.component.html',
})
export class RequestDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly requests = inject(RequestService);

  protected readonly request = signal<ServiceRequest | null>(null);
  protected readonly error = signal('');

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.requests.get(id).subscribe({
      next: (request) => this.request.set(request),
      error: () => this.error.set(`Request ${id} was not found.`),
    });
  }
}
