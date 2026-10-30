import { Component } from '@angular/core';

@Component({
  selector: 'app-admin-home',
  templateUrl: './admin-home.component.html',
})
export class AdminHomeComponent {
  users = [
    { id: 1, name: 'Ada Example' },
    { id: 2, name: 'Grace Sample' },
  ];
}
