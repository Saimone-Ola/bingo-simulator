import { Router } from 'express';
import {
  SLOT_PUBLISH_SIMULATION_SPINS,
  slotCreateSchema,
  slotListQuerySchema,
  slotSimulateSchema,
  slotSpinSchema,
  type SlotCommitment,
} from '@bingo/shared';
import { AppError } from '../../errors';
import {
  createSlotMachine,
  getSlotMachine,
  listSlotMachines,
  publishSlotMachine,
  simulateSlotMachine,
  slotCommitments,
  spinSlotMachine,
  updateSlotMachine,
} from '../../services/slots';
import { asyncRoute, requireAuth } from '../middleware/auth';
import { parseBody } from '../validate';

/**
 * Slot machine API.
 *
 * The client authors configurations and places bets. It never sends a grid, a
 * seed, a win or an RTP, and there is no route here that would accept one.
 */
const slotRoutes: Router = Router();

slotRoutes.use(requireAuth);

slotRoutes.get(
  '/',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const query = slotListQuerySchema.parse(request.query);
    const machines = await listSlotMachines(request.auth.userId, {
      ...(query.mine === undefined ? {} : { mine: query.mine }),
      ...(query.volatility === undefined ? {} : { volatility: query.volatility }),
      limit: query.limit,
    });
    response.json({ machines });
  }),
);

slotRoutes.post(
  '/',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const body = parseBody(slotCreateSchema, request.body);
    const machine = await createSlotMachine(request.auth.userId, {
      name: body.name,
      description: body.description,
      config: body.config,
      minBetCredits: body.minBetCredits,
      maxBetCredits: body.maxBetCredits,
    });
    response.status(201).json({ machine });
  }),
);

/**
 * Runs a simulation on a configuration that has not been saved yet, so the
 * editor can show a measured RTP while the author is still moving sliders.
 * Nothing is persisted and nothing is trusted from it later: publishing runs
 * its own simulation on the stored machine.
 */
slotRoutes.post(
  '/simulate',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const body = parseBody(slotSimulateSchema, request.body);
    const report = await simulateSlotMachine(body.config, body.spins);
    response.json({ report });
  }),
);

slotRoutes.get(
  '/:id',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const machine = await getSlotMachine(String(request.params.id), request.auth.userId);
    response.json({ machine });
  }),
);

slotRoutes.patch(
  '/:id',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const body = parseBody(slotCreateSchema, request.body);
    const machine = await updateSlotMachine(String(request.params.id), request.auth.userId, {
      name: body.name,
      description: body.description,
      config: body.config,
      minBetCredits: body.minBetCredits,
      maxBetCredits: body.maxBetCredits,
    });
    response.json({ machine });
  }),
);

slotRoutes.post(
  '/:id/publish',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const result = await publishSlotMachine(String(request.params.id), request.auth.userId);
    response.json({ ...result, simulationSpins: SLOT_PUBLISH_SIMULATION_SPINS });
  }),
);

/** Hashes of the seeds the next spins will use, published before they happen. */
slotRoutes.get(
  '/:id/commit',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const machineId = String(request.params.id);
    const machine = await getSlotMachine(machineId, request.auth.userId);
    const payload: SlotCommitment = {
      machineId,
      entries: slotCommitments(machineId, machine.totalSpins + 1),
    };
    response.json(payload);
  }),
);

slotRoutes.post(
  '/:id/spin',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const body = parseBody(slotSpinSchema, request.body);
    const spin = await spinSlotMachine(
      String(request.params.id),
      request.auth.userId,
      body.betPerLine,
      body.requestId,
    );
    response.json({ spin });
  }),
);

export default slotRoutes;
