export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface ProductDocument extends Product {
  _id?: string;
}