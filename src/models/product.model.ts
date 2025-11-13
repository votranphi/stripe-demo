export interface Product {
  id: string;
  name: string;
  price: number;
}

export interface ProductDocument extends Product {
  _id?: string;
}