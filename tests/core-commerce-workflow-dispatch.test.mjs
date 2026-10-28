import test from "node:test";
import assert from "node:assert/strict";
import { dispatchWorkflow } from "../api/app/workflow.mjs";

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = String(value); }
  };
}

function assertNotFound(res, label) {
  assert.equal(res.statusCode, 404, label);
  assert.deepEqual(JSON.parse(res.body), {
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Workflow route is not available"
    }
  }, label);
  assert.equal(res.headers["cache-control"], "no-store", label);
}

// Prior to the own-property guard, names such as "constructor" and
// "toString" resolve to inherited callable Object.prototype properties.
// The dispatcher would invoke them as though they were application routes,
// leaving a response without a 404.
test("unknown and inherited workflow routes fail closed before handler execution", async () => {
  const inheritedNames = [
    "constructor", "toString", "valueOf", "hasOwnProperty",
    "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__",
    "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
    "__proto__", "then", "does-not-exist", ""
  ];
  for (const route of inheritedNames) {
    const fromUrl = response();
    await dispatchWorkflow({
      method: "GET",
      url: "/api/app/workflow?route=" + encodeURIComponent(route),
      headers: {}
    }, fromUrl);
    assertNotFound(fromUrl, "URL route " + route);

    const fromQuery = response();
    await dispatchWorkflow({
      method: "GET",
      url: "/api/app/workflow",
      query: { route },
      headers: {}
    }, fromQuery);
    assertNotFound(fromQuery, "query route " + route);
  }
});

test("explicit routes execute normally with unchanged request, response and dependencies", async () => {
  const seen = [];
  const deps = { marker: "no-upstream-transport" };
  const req = { method: "GET", url: "/api/app/workflow?route=commerce-dashboard" };
  const res = response();
  const routes = Object.freeze({
    "commerce-dashboard": async (gotReq, gotRes, gotDeps) => {
      seen.push({ gotReq, gotRes, gotDeps });
      gotRes.statusCode = 204;
      gotRes.end();
    },
    "not-a-function": "not-a-handler"
  });
  await dispatchWorkflow(req, res, deps, routes);
  assert.equal(res.statusCode, 204);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].gotReq, req);
  assert.equal(seen[0].gotRes, res);
  assert.equal(seen[0].gotDeps, deps);

  const malformed = response();
  await dispatchWorkflow({
    method: "GET", query: { route: "not-a-function" }
  }, malformed, deps, routes);
  assertNotFound(malformed, "own property must be a function");
});

test("inherited callable on an injected route table is not executable", async () => {
  let called = false;
  const routes = Object.create({ ghost: () => { called = true; } });
  routes["commerce-menu"] = async (req, res) => {
    res.statusCode = 200;
    res.end("ok");
  };

  const unknown = response();
  await dispatchWorkflow({ url: "/api/app/workflow?route=ghost" }, unknown, {}, routes);
  assertNotFound(unknown, "inherited ghost handler");
  assert.equal(called, false);

  const valid = response();
  await dispatchWorkflow({ url: "/api/app/workflow?route=commerce-menu" }, valid, {}, routes);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body, "ok");
});
