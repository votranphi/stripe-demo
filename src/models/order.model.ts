export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID'
}

export interface OrderProduct {
  id: string;
  quantity: number;
}

export interface Order {
  id: string;
  products: OrderProduct[];
  status: OrderStatus;
}

export interface OrderDocument extends Order {
  _id?: string;
}