import { describe, expect, it } from 'vitest';
import { Order, type CreateOrderInput, type OrderStatus } from '../../src/domain/order';
import { DomainError } from '../../src/domain/errors';

const validInput = (): CreateOrderInput => ({
  customerId: 'cli-1',
  items: [
    { productId: 'p1', quantity: 2, unitPriceCents: 1500 },
    { productId: 'p2', quantity: 1, unitPriceCents: 999 },
  ],
});

const expectDomainError = (fn: () => unknown, code: DomainError['code']) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`esperava DomainError ${code}`);
};

const orderWithStatus = (status: OrderStatus): Order => {
  const order = Order.create(validInput());
  if (status === 'PAID') order.pay();
  if (status === 'CANCELLED') order.cancel();
  return order;
};

describe('Order.create', () => {
  it('cria pedido válido em PENDING com id UUID e datas', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const order = Order.create(validInput(), now);

    expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(order.customerId).toBe('cli-1');
    expect(order.status).toBe('PENDING');
    expect(order.items).toHaveLength(2);
    expect(order.createdAt).toEqual(now);
    expect(order.updatedAt).toEqual(now);
  });

  it('gera ids diferentes para pedidos diferentes', () => {
    expect(Order.create(validInput()).id).not.toBe(Order.create(validInput()).id);
  });

  it('calcula o total em centavos', () => {
    expect(Order.create(validInput()).totalCents).toBe(2 * 1500 + 999);
  });

  it('aceita item com preço zero', () => {
    const order = Order.create({
      customerId: 'cli-1',
      items: [{ productId: 'brinde', quantity: 3, unitPriceCents: 0 }],
    });
    expect(order.totalCents).toBe(0);
  });

  it('não compartilha referência dos itens com a entrada', () => {
    const input = validInput();
    const order = Order.create(input);
    input.items[0].quantity = 99;
    expect(order.items[0].quantity).toBe(2);
  });

  it.each([[''], ['   ']])('rejeita customerId vazio (%j)', (customerId) => {
    expectDomainError(() => Order.create({ ...validInput(), customerId }), 'INVALID_CUSTOMER');
  });

  it('rejeita customerId que não é string', () => {
    expectDomainError(
      () => Order.create({ ...validInput(), customerId: undefined as unknown as string }),
      'INVALID_CUSTOMER',
    );
  });

  it('rejeita pedido sem itens', () => {
    expectDomainError(() => Order.create({ customerId: 'cli-1', items: [] }), 'EMPTY_ORDER');
  });

  it('rejeita items que não é array', () => {
    expectDomainError(
      () => Order.create({ customerId: 'cli-1', items: null as unknown as [] }),
      'EMPTY_ORDER',
    );
  });

  it.each([[0], [-1], [1.5], [Number.NaN]])('rejeita quantity inválida (%s)', (quantity) => {
    expectDomainError(
      () =>
        Order.create({
          customerId: 'cli-1',
          items: [{ productId: 'p1', quantity, unitPriceCents: 100 }],
        }),
      'INVALID_QUANTITY',
    );
  });

  it.each([[-1], [10.5], [Number.NaN]])('rejeita unitPriceCents inválido (%s)', (unitPriceCents) => {
    expectDomainError(
      () =>
        Order.create({
          customerId: 'cli-1',
          items: [{ productId: 'p1', quantity: 1, unitPriceCents }],
        }),
      'INVALID_PRICE',
    );
  });
});

describe('Order transições', () => {
  it('PENDING → PAID', () => {
    const order = Order.create(validInput(), new Date('2026-01-01T00:00:00.000Z'));
    const paidAt = new Date('2026-01-02T00:00:00.000Z');
    order.pay(paidAt);
    expect(order.status).toBe('PAID');
    expect(order.updatedAt).toEqual(paidAt);
  });

  it('PENDING → CANCELLED', () => {
    const order = Order.create(validInput(), new Date('2026-01-01T00:00:00.000Z'));
    const cancelledAt = new Date('2026-01-03T00:00:00.000Z');
    order.cancel(cancelledAt);
    expect(order.status).toBe('CANCELLED');
    expect(order.updatedAt).toEqual(cancelledAt);
  });

  it.each<[OrderStatus, 'pay' | 'cancel']>([
    ['PAID', 'pay'],
    ['PAID', 'cancel'],
    ['CANCELLED', 'pay'],
    ['CANCELLED', 'cancel'],
  ])('rejeita transição a partir de %s com %s', (status, action) => {
    const order = orderWithStatus(status);
    const before = order.updatedAt;
    expectDomainError(() => order[action](), 'INVALID_TRANSITION');
    expect(order.status).toBe(status);
    expect(order.updatedAt).toBe(before);
  });
});

describe('Order.restore e toJSON', () => {
  it('reconstrói o pedido persistido e serializa', () => {
    const props = {
      id: '0b9c7a52-8d2e-4a1b-9f3e-1c2d3e4f5a6b',
      customerId: 'cli-9',
      items: [{ productId: 'p1', quantity: 1, unitPriceCents: 500 }],
      status: 'PAID' as const,
      totalCents: 500,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const order = Order.restore(props);
    expect(order.status).toBe('PAID');
    expect(order.toJSON()).toEqual(props);
    expectDomainError(() => order.cancel(), 'INVALID_TRANSITION');
  });
});

describe('DomainError', () => {
  it('usa mensagem padrão em português', () => {
    const error = new DomainError('ORDER_NOT_FOUND');
    expect(error.message).toBe('pedido não encontrado');
    expect(error.name).toBe('DomainError');
  });

  it('aceita mensagem customizada', () => {
    expect(new DomainError('EMPTY_ORDER', 'outra').message).toBe('outra');
  });
});
