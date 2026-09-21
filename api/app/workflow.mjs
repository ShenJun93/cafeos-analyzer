import { appJson } from '../_app-auth.mjs';
import { handle as actionsHandle } from '../../server/app/actions.mjs';
import { handle as actionStatusHandle } from '../../server/app/action-status.mjs';
import { handle as measurementWindowHandle } from '../../server/app/measurement-window.mjs';
import { handle as actionDetailHandle } from '../../server/app/action-detail.mjs';

export const WORKFLOW_ROUTES = Object.freeze({
  actions: actionsHandle,
  'action-status': actionStatusHandle,
  'measurement-window': measurementWindowHandle,
  'action-detail': actionDetailHandle
});

function requestedWorkflowRoute(req) {
  const direct = req?.query?.route;
  if (Array.isArray(direct)) return String(direct[0] ?? '').trim();
  if (direct !== undefined && direct !== null) return String(direct).trim();
  return String(new URL(req?.url ?? '/', 'https://cafeos.local').searchParams.get('route') ?? '').trim();
}

export async function dispatchWorkflow(req, res, deps = {}, routes = WORKFLOW_ROUTES) {
  const route = requestedWorkflowRoute(req);
  const handler = routes[route];
  if (typeof handler !== 'function') {
    return appJson(res, 404, {
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Workflow route is not available'
      }
    });
  }
  return handler(req, res, deps);
}

export default async function handler(req, res) {
  return dispatchWorkflow(req, res);
}
