export type DomainErrorCode =
  | 'INVALID_CUSTOMER'
  | 'EMPTY_ORDER'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'ORDER_NOT_FOUND'
  | 'INVALID_TRANSITION';

const DEFAULT_MESSAGES: Record<DomainErrorCode, string> = {
  INVALID_CUSTOMER: 'customerId é obrigatório e não pode ser vazio',
  EMPTY_ORDER: 'o pedido precisa ter pelo menos 1 item',
  INVALID_QUANTITY: 'quantity deve ser um inteiro maior que zero',
  INVALID_PRICE: 'unitPriceCents deve ser um inteiro maior ou igual a zero',
  ORDER_NOT_FOUND: 'pedido não encontrado',
  INVALID_TRANSITION: 'transição de status inválida',
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'DomainError';
    this.code = code;
  }
}
