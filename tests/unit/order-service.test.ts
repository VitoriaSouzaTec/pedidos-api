import { beforeEach, describe, expect, it } from 'vitest';
import { OrderService } from '../../src/application/order-service';
import { DomainError } from '../../src/domain/errors';
import { InMemoryOrderRepository } from '../../src/infra/in-memory-order-repository';

const input = {
  customerId: 'cli-1',
  items: [{ productId: 'p1', quantity: 2, unitPriceCents: 1500 }],
};

const missingId = '00000000-0000-4000-8000-000000000000';

describe('OrderService', () => {
  let repository: InMemoryOrderRepository;
  let service: OrderService;
  let now: Date;

  beforeEach(() => {
    repository = new InMemoryOrderRepository();
    now = new Date('2026-01-01T00:00:00.000Z');
    service = new OrderService(repository, () => now);
  });

  it('cria e persiste um pedido PENDING', async () => {
    const order = await service.createOrder(input);

    expect(order.status).toBe('PENDING');
    expect(order.totalCents).toBe(3000);
    expect(order.createdAt).toEqual(now);

    const stored = await repository.findById(order.id);
    expect(stored?.toJSON()).toEqual(order.toJSON());
  });

  it('não persiste pedido inválido', async () => {
    await expect(service.createOrder({ customerId: '', items: input.items })).rejects.toMatchObject({
      code: 'INVALID_CUSTOMER',
    });
  });

  it('consulta pedido existente', async () => {
    const created = await service.createOrder(input);
    const found = await service.getOrder(created.id);
    expect(found.id).toBe(created.id);
  });

  it.each(['getOrder', 'payOrder', 'cancelOrder'] as const)(
    '%s lança ORDER_NOT_FOUND para id inexistente',
    async (method) => {
      const promise = service[method](missingId);
      await expect(promise).rejects.toBeInstanceOf(DomainError);
      await expect(service[method](missingId)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    },
  );

  it('paga pedido PENDING e persiste o novo status', async () => {
    const created = await service.createOrder(input);
    now = new Date('2026-01-02T00:00:00.000Z');

    const paid = await service.payOrder(created.id);

    expect(paid.status).toBe('PAID');
    expect(paid.updatedAt).toEqual(now);
    expect((await repository.findById(created.id))?.status).toBe('PAID');
  });

  it('cancela pedido PENDING e persiste o novo status', async () => {
    const created = await service.createOrder(input);
    const cancelled = await service.cancelOrder(created.id);

    expect(cancelled.status).toBe('CANCELLED');
    expect((await repository.findById(created.id))?.status).toBe('CANCELLED');
  });

  it.each([
    ['payOrder', 'payOrder'],
    ['payOrder', 'cancelOrder'],
    ['cancelOrder', 'payOrder'],
    ['cancelOrder', 'cancelOrder'],
  ] as const)('após %s, %s lança INVALID_TRANSITION', async (first, second) => {
    const created = await service.createOrder(input);
    const afterFirst = await service[first](created.id);

    await expect(service[second](created.id)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect((await repository.findById(created.id))?.status).toBe(afterFirst.status);
  });

  it('usa o relógio real por padrão', async () => {
    const defaultService = new OrderService(new InMemoryOrderRepository());
    const before = Date.now();
    const order = await defaultService.createOrder(input);
    expect(order.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('InMemoryOrderRepository', () => {
  it('retorna null para id inexistente', async () => {
    expect(await new InMemoryOrderRepository().findById(missingId)).toBeNull();
  });

  it('isola o estado salvo de mutações posteriores na entidade', async () => {
    const repository = new InMemoryOrderRepository();
    const service = new OrderService(repository);
    const order = await service.createOrder(input);

    order.pay();

    expect((await repository.findById(order.id))?.status).toBe('PENDING');
  });
});
