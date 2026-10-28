import {
  appConfig,
  appError,
  appJson,
  onlyGet
} from "../../api/_app-auth.mjs";

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const { url, publishableKey } = appConfig(deps.env ?? process.env);
    return appJson(res, 200, {
      supabaseUrl: url,
      publishableKey
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
