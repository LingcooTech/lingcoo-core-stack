import type { FastifyPluginAsync } from 'fastify';

import {
  adminAssignSupportTicketSchema,
  adminSupportTicketReplySchema,
  adminUpdateSupportTicketStatusSchema,
  createSupportTicketSchema,
  supportTicketListQuerySchema,
  supportTicketNoParamsSchema,
  supportTicketReplySchema,
} from './schemas';
import { TicketService } from './service';

export const ticketRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/tickets/me', { preHandler: app.authenticate }, async (request) => {
    const query = supportTicketListQuerySchema.parse(request.query);
    return new TicketService(app.db).listMyTickets({
      userId: request.user.sub,
      ...query,
    });
  });

  app.post('/v1/tickets', { preHandler: app.authenticate }, async (request, reply) => {
    const payload = createSupportTicketSchema.parse(request.body);
    const result = await new TicketService(app.db).createTicket({
      userId: request.user.sub,
      ...payload,
    });
    return reply.status(201).send(result);
  });

  app.get('/v1/tickets/:ticketNo', { preHandler: app.authenticate }, async (request) => {
    const params = supportTicketNoParamsSchema.parse(request.params);
    return new TicketService(app.db).getMyTicket(params.ticketNo, request.user.sub);
  });

  app.post('/v1/tickets/:ticketNo/messages', { preHandler: app.authenticate }, async (request) => {
    const params = supportTicketNoParamsSchema.parse(request.params);
    const payload = supportTicketReplySchema.parse(request.body);
    return new TicketService(app.db).replyMyTicket({
      ticketNo: params.ticketNo,
      userId: request.user.sub,
      body: payload.body,
    });
  });

  app.post('/v1/tickets/:ticketNo/close', { preHandler: app.authenticate }, async (request) => {
    const params = supportTicketNoParamsSchema.parse(request.params);
    return new TicketService(app.db).closeMyTicket({
      ticketNo: params.ticketNo,
      userId: request.user.sub,
    });
  });

  app.get(
    '/v1/admin/tickets',
    { preHandler: app.requirePermission('tickets.manage') },
    async (request) => {
      const query = supportTicketListQuerySchema.parse(request.query);
      return new TicketService(app.db).listAdminTickets(query);
    },
  );

  app.get(
    '/v1/admin/tickets/:ticketNo',
    { preHandler: app.requirePermission('tickets.manage') },
    async (request) => {
      const params = supportTicketNoParamsSchema.parse(request.params);
      return new TicketService(app.db).getAdminTicket(params.ticketNo);
    },
  );

  app.post(
    '/v1/admin/tickets/:ticketNo/messages',
    { preHandler: app.requirePermission('tickets.manage') },
    async (request) => {
      const params = supportTicketNoParamsSchema.parse(request.params);
      const payload = adminSupportTicketReplySchema.parse(request.body);
      return new TicketService(app.db).replyAdminTicket({
        ticketNo: params.ticketNo,
        actorUserId: request.user.sub,
        body: payload.body,
        isInternal: payload.isInternal,
      });
    },
  );

  app.post(
    '/v1/admin/tickets/:ticketNo/assign',
    { preHandler: app.requirePermission('tickets.manage') },
    async (request) => {
      const params = supportTicketNoParamsSchema.parse(request.params);
      const payload = adminAssignSupportTicketSchema.parse(request.body);
      return new TicketService(app.db).assignTicket({
        ticketNo: params.ticketNo,
        actorUserId: request.user.sub,
        assignedAdminUserId: payload.assignedAdminUserId,
      });
    },
  );

  app.post(
    '/v1/admin/tickets/:ticketNo/status',
    { preHandler: app.requirePermission('tickets.manage') },
    async (request) => {
      const params = supportTicketNoParamsSchema.parse(request.params);
      const payload = adminUpdateSupportTicketStatusSchema.parse(request.body);
      return new TicketService(app.db).updateAdminTicketStatus({
        ticketNo: params.ticketNo,
        actorUserId: request.user.sub,
        status: payload.status,
      });
    },
  );
};
