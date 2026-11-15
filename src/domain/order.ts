import { randomUUID } from 'node:crypto';
import { DomainError } from './errors';

export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateOrderInput {
  customerId: string;
  items: OrderItem[];
}

export interface OrderProps {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Transições permitidas a partir de cada status. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

/**
 * Entidade Pedido. Concentra as regras de negócio (SRP):
 * validação dos dados, cálculo do total em centavos e transições de status.
 */
export class Order {
  readonly id: string;
  readonly customerId: string;
  readonly items: readonly OrderItem[];
  readonly totalCents: number;
  readonly createdAt: Date;
  private _status: OrderStatus;
  private _updatedAt: Date;

  private constructor(props: OrderProps) {
    this.id = props.id;
    this.customerId = props.customerId;
    this.items = props.items.map((item) => ({ ...item }));
    this.totalCents = props.totalCents;
    this.createdAt = props.createdAt;
    this._status = props.status;
    this._updatedAt = props.updatedAt;
  }

  /** Cria um novo pedido em `PENDING`, validando as entradas. */
  static create(input: CreateOrderInput, now: Date = new Date()): Order {
    if (typeof input.customerId !== 'string' || input.customerId.trim() === '') {
      throw new DomainError('INVALID_CUSTOMER');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new DomainError('EMPTY_ORDER');
    }
    for (const item of input.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new DomainError('INVALID_QUANTITY');
      }
      if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
        throw new DomainError('INVALID_PRICE');
      }
    }

    return new Order({
      id: randomUUID(),
      customerId: input.customerId,
      items: input.items,
      status: 'PENDING',
      totalCents: Order.calculateTotal(input.items),
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstrói um pedido já persistido (sem gerar novo id nem revalidar). */
  static restore(props: OrderProps): Order {
    return new Order(props);
  }

  /** Soma de `quantity * unitPriceCents`; dinheiro sempre em centavos inteiros. */
  static calculateTotal(items: readonly OrderItem[]): number {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  }

  get status(): OrderStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  pay(now: Date = new Date()): void {
    this.transitionTo('PAID', now);
  }

  cancel(now: Date = new Date()): void {
    this.transitionTo('CANCELLED', now);
  }

  private transitionTo(next: OrderStatus, now: Date): void {
    if (!ALLOWED_TRANSITIONS[this._status].includes(next)) {
      throw new DomainError(
        'INVALID_TRANSITION',
        `não é possível mudar o status de ${this._status} para ${next}`,
      );
    }
    this._status = next;
    this._updatedAt = now;
  }

  toJSON(): OrderProps {
    return {
      id: this.id,
      customerId: this.customerId,
      items: this.items.map((item) => ({ ...item })),
      status: this._status,
      totalCents: this.totalCents,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
