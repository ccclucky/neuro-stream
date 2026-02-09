import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createProviderApp } from '../src/app';

describe('Provider API (simplified)', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createProviderApp();
  });

  describe('GET /health', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('POST /invoke', () => {
    it('should return result for valid text input', async () => {
      const response = await request(app)
        .post('/invoke')
        .send({ text: 'hello world' })
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('length');
      expect(response.body.result).toHaveProperty('text');
      expect(response.body.result.length).toBe(11);
      expect(response.body.result.text).toBe('hello world');
    });

    it('should return 400 if text is missing', async () => {
      const response = await request(app)
        .post('/invoke')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing text parameter');
    });

    it('should handle unicode text', async () => {
      const response = await request(app)
        .post('/invoke')
        .send({ text: '你好世界' })
        .expect(200);

      expect(response.body.result.length).toBe(4);
    });
  });

  describe('Service: string-length', () => {
    it('should compute string length correctly', async () => {
      const { computeStringLength } = await import('../src/services/string-length');
      expect(computeStringLength('hello')).toBe(5);
    });

    it('should handle unicode correctly', async () => {
      const { computeStringLength } = await import('../src/services/string-length');
      expect(computeStringLength('你好')).toBe(2);
    });
  });
});
