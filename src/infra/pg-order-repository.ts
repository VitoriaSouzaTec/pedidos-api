import type { Pool } from 'pg';
import { Order, type OrderItem, type OrderStatus } from '../domain/order';
import type { OrderRepository } from '../domain/order-repository';

interface OrderRow {
  id: string;
  customer_id: string;
  items: OrderItem[];
  status: OrderStatus;
  total_cents: string;
  created_at: Date;
  updated_at: Date;
}

export class PgOrderRepository implements OrderRepository {
  constructor(private readonly pool: Pool) {}

  async save(order: Order): Promise<void> {
    await this.pool.query(
      `INSERT INTO orders (id, customer_id, items, status, total_cents, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at`,
      [
        order.id,
        order.customerId,
        JSON.stringify(order.items),
        order.status,
        order.totalCents,
        order.createdAt,
        order.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Order | null> {
    const result = await this.pool.query<OrderRow>(
      `SELECT id, customer_id, items, status, total_cents, created_at, updated_at
         FROM orders
        WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return Order.restore({
      id: row.id,
      customerId: row.customer_id,
      items: row.items,
      status: row.status,
      totalCents: Number(row.total_cents),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
