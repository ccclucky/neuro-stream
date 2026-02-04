// Envio Event Handlers for NeuroStream Escrow Contract
// See https://docs.envio.dev for handler documentation

import {
  Escrow_PaymentLocked,
  Escrow_PaymentReleased,
  Escrow_PaymentRefunded,
} from 'generated';

// Handler for PaymentLocked event
Escrow_PaymentLocked.handler(async ({ event, context }) => {
  const payment = {
    id: event.params.requestId,
    requestId: event.params.requestId,
    agent: event.params.agent,
    provider: event.params.provider,
    amount: event.params.amount,
    hashLock: event.params.hashLock,
    deadline: event.params.deadline,
    status: 'Locked',
    preimage: null,
    createdAt: event.block.timestamp,
    updatedAt: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
  };

  context.Payment.set(payment);
});

// Handler for PaymentReleased event
Escrow_PaymentReleased.handler(async ({ event, context }) => {
  const existingPayment = await context.Payment.get(event.params.requestId);

  if (existingPayment) {
    context.Payment.set({
      ...existingPayment,
      status: 'Released',
      preimage: event.params.preimage,
      updatedAt: event.block.timestamp,
    });
  }
});

// Handler for PaymentRefunded event
Escrow_PaymentRefunded.handler(async ({ event, context }) => {
  const existingPayment = await context.Payment.get(event.params.requestId);

  if (existingPayment) {
    context.Payment.set({
      ...existingPayment,
      status: 'Refunded',
      updatedAt: event.block.timestamp,
    });
  }
});
