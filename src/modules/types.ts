import type { FastifyPluginAsync } from 'fastify';

export type AppModule = {
  name: string;
  register: FastifyPluginAsync;
};
