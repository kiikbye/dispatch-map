import test from "node:test";
import assert from "node:assert/strict";
import network from "../dist/almaty-data.mjs";
import { couriers, orders, plan, shortestPath } from "../dist/engine.mjs";

test("the initial shift assigns twelve orders to four couriers on time", () => {
  const result = plan();
  assert.equal(result.routes.length, 4);
  assert.equal(result.stops.length, 12);
  assert.equal(result.late, 0);
  assert.equal(result.moved, 0);
  assert.ok(Math.abs(result.km - 10.33) < 0.01);
});

test("delivery paths follow directed Almaty streets and their lengths match", () => {
  const edges = new Map(network.segments.map(([from, to, metres]) => [from + ":" + to, metres]));
  assert.ok(edges.size > 1000);
  assert.ok(network.segments.some(([from, to]) => !edges.has(to + ":" + from)));
  for (const { leg } of plan().stops) {
    const segments = leg.path.slice(1).map((node, index) => edges.get(leg.path[index].id + ":" + node.id));
    assert.ok(segments.every(metres => metres > 0));
    assert.ok(Math.abs(leg.km * 1000 - segments.reduce((sum, metres) => sum + metres, 0)) < 1e-6);
  }
  const { path } = shortestPath(network.anchors["101"], network.anchors["103"]);
  assert.equal(path[0].id, network.anchors["101"]);
  assert.equal(path.at(-1).id, network.anchors["103"]);
  assert.ok(path.length > 10);
});

test("every outage reassigns only the three affected orders and respects capacity", () => {
  for (const outage of couriers) {
    for (const strategy of ["deadline", "nearest"]) {
      const result = plan(outage.id, strategy);
      assert.equal(result.routes.length, 3);
      assert.equal(result.stops.length, orders.length);
      assert.equal(new Set(result.stops.map(stop => stop.id)).size, orders.length);
      assert.equal(result.moved, 3);
      assert.deepEqual(result.unassigned, []);
      for (const route of result.routes) {
        assert.notEqual(route.courier.id, outage.id);
        assert.ok(route.stops.length <= route.courier.capacity);
        const original = orders.filter(order => order.owner === route.courier.id).map(order => order.id);
        assert.deepEqual(route.stops.filter(stop => stop.owner === route.courier.id).map(stop => stop.id), original);
        for (const stop of route.stops) assert.equal(stop.late, Math.max(0, stop.eta - stop.due));
      }
    }
  }
});

test("deadline-aware insertion reduces late stops and delay in the default outage", () => {
  const better = plan("mira", "deadline");
  const nearest = plan("mira", "nearest");
  assert.equal(better.late, 2);
  assert.equal(nearest.late, 3);
  assert.equal(better.delay, 30);
  assert.equal(nearest.delay, 38);
  assert.ok(better.km > nearest.km);
});

test("outage plans are deterministic and leave the initial shift unchanged", () => {
  const initial = plan();
  for (const courier of couriers) {
    assert.deepEqual(plan(courier.id), plan(courier.id));
  }
  assert.deepEqual(plan(), initial);
});
