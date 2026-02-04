import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createProviderApp } from '../src/app';

describe('Provider API', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createProviderApp({
      escrowAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      rpcUrl: 'http://127.0.0.1:8545',
      providerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    });
  });

  describe('POST /invoke without payment', () => {
    it('should return 402 Payment Required with challenge', async () => {
      const response = await request(app)
        .post('/invoke')
        .send({ text: 'hello world' })
        .expect(402);

      expect(response.body).toHaveProperty('amount');
      expect(response.body).toHaveProperty('asset');
      expect(response.body).toHaveProperty('recipient');
      expect(response.body).toHaveProperty('hashLock');
      expect(response.body).toHaveProperty('deadline');
      expect(response.body.asset).toBe('ETH');
      expect(response.body.hashLock).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('POST /invoke with requestId', () => {
    it('should return 400 if payment not found on chain', async () => {
      const response = await request(app)
        .post('/invoke')
        .send({
          text: 'hello world',
          requestId: '0x1234567890123456789012345678901234567890123456789012345678901234',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /health', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('Service: string-length', () => {
    it('should compute string length correctly', async () => {
      // This test verifies the service logic in isolation
      const { computeStringLength } = await import('../src/services/string-length');
      const result = computeStringLength('hello');
      expect(result).toBe(5);
    });

    it('should handle unicode correctly', async () => {
      const { computeStringLength } = await import('../src/services/string-length');
      const result = computeStringLength('你好');
      expect(result).toBe(2);
    });
  });
});
