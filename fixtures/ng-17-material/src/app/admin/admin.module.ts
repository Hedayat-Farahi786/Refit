import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { AdminHomeComponent } from './admin-home/admin-home.component';
import { AdminRoutingModule } from './admin-routing.module';
import { UserEditComponent } from './user-edit/user-edit.component';

@NgModule({
  declarations: [AdminHomeComponent, UserEditComponent],
  imports: [CommonModule, ReactiveFormsModule, AdminRoutingModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
})
export class AdminModule {}
