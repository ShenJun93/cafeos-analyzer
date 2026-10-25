import { appJson } from '../_app-auth.mjs';
import { handle as actionsHandle } from '../../server/app/actions.mjs';
import { handle as actionStatusHandle } from '../../server/app/action-status.mjs';
import { handle as measurementWindowHandle } from '../../server/app/measurement-window.mjs';
import { handle as actionDetailHandle } from '../../server/app/action-detail.mjs';
import { handle as clientConfigHandle } from '../../server/commerce/client-config.mjs';
import { handle as menuHandle } from '../../server/commerce/menu.mjs';
import { handle as orderHandle } from '../../server/commerce/order.mjs';
import { handle as paymentHandle } from '../../server/commerce/payment.mjs';
import { handle as orderStatusHandle } from '../../server/commerce/order-status.mjs';
import { handle as dashboardHandle } from '../../server/commerce/dashboard.mjs';
import { handle as dailyCloseHandle } from '../../server/commerce/daily-close.mjs';

export const WORKFLOW_ROUTES = Object.freeze({
  actions: actionsHandle,
  'action-status': actionStatusHandle,
  'measurement-window': measurementWindowHandle,
  'action-detail': actionDetailHandle,
  'client-config': clientConfigHandle,
  'commerce-menu': menuHandle,
  'commerce-order': orderHandle,
  'commerce-payment': paymentHandle,
  'commerce-order-status': orderStatusHandle,
  'commerce-dashboard': dashboardHandle,
  'commerce-daily-close': dailyCloseHandle
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
