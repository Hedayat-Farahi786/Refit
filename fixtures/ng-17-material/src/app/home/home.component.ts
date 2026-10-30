import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Welcome</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p>Browse the product catalog or manage users in the admin area.</p>
      </mat-card-content>
      <mat-card-actions>
        <a mat-raised-button color="primary" routerLink="/products">View products</a>
      </mat-card-actions>
    </mat-card>
  `,
})
export class HomeComponent {}
