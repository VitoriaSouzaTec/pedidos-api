import { DomainError } from '../domain/errors';
import { Order, type CreateOrderInput } from '../domain/order';
import type { OrderRepository } from '../domain/order-repository';

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const order = Order.create(input, this.clock());
    await this.repository.save(order);
    return order;
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) {
      throw new DomainError('ORDER_NOT_FOUND');
    }
    return order;
  }

  async payOrder(id: string): Promise<Order> {
    const order = await this.getOrder(id);
    order.pay(this.clock());
    await this.repository.save(order);
    return order;
  }

  async cancelOrder(id: string): Promise<Order> {
    const order = await this.getOrder(id);
    order.cancel(this.clock());
    await this.repository.save(order);
    return order;
  }
}
