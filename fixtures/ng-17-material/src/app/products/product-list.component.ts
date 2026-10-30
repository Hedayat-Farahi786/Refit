import { Component, OnInit } from '@angular/core';
import { Product, ProductService } from '../services/product.service';

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.scss'],
})
export class ProductListComponent implements OnInit {
  displayedColumns = ['id', 'name', 'category', 'price'];
  products: Product[] = [];
  loading = true;

  constructor(private productService: ProductService) {}

  ngOnInit(): void {
    this.productService.products().subscribe({
      next: (products) => {
        this.products = products;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }
}
