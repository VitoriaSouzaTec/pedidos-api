import { Order, type OrderProps } from '../domain/order';
import type { OrderRepository } from '../domain/order-repository';

export class InMemoryOrderRepository implements OrderRepository {
  private readonly store = new Map<string, OrderProps>();

  async save(order: Order): Promise<void> {
    this.store.set(order.id, order.toJSON());
  }

  async findById(id: string): Promise<Order | null> {
    const props = this.store.get(id);
    return props ? Order.restore({ ...props, items: props.items.map((item) => ({ ...item })) }) : null;
  }
}
