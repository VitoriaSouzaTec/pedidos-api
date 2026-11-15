import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:POST /orders}': ['p(95)<300'],
  },
};

const headers = { 'Content-Type': 'application/json' };

export default function () {
  const payload = JSON.stringify({
    customerId: `k6-${__VU}`,
    items: [
      { productId: 'p1', quantity: 2, unitPriceCents: 1500 },
      { productId: 'p2', quantity: 1, unitPriceCents: 990 },
    ],
  });

  const created = http.post(`${BASE_URL}/orders`, payload, {
    headers,
    tags: { name: 'POST /orders' },
  });
  const createdOk = check(created, {
    'POST /orders → 201': (r) => r.status === 201,
    'POST /orders → Location': (r) => Boolean(r.headers.Location),
    'POST /orders → totalCents 3990': (r) => r.status === 201 && r.json('totalCents') === 3990,
  });
  if (!createdOk) {
    sleep(1);
    return;
  }

  const id = created.json('id');

  const fetched = http.get(`${BASE_URL}/orders/${id}`, {
    tags: { name: 'GET /orders/:id' },
  });
  check(fetched, {
    'GET /orders/:id → 200': (r) => r.status === 200,
    'GET /orders/:id → PENDING': (r) => r.json('status') === 'PENDING',
  });

  const paid = http.post(`${BASE_URL}/orders/${id}/pay`, null, {
    tags: { name: 'POST /orders/:id/pay' },
  });
  check(paid, {
    'POST /orders/:id/pay → 200': (r) => r.status === 200,
    'POST /orders/:id/pay → PAID': (r) => r.json('status') === 'PAID',
  });

  sleep(1);
}
