import network from "./almaty-data.mjs";

export const START = 10 * 60;
export const CITY = { width: network.width, height: network.height, metresPerPixel: network.metresPerPixel };
const SERVICE = 3;
const anchor = id => network.anchors[id];
export const nodes = network.points.map(([x, y], id) => ({ id, x, y }));

const adjacency = nodes.map(() => []);
for (const [start, end, metres] of network.segments) {
  adjacency[start].push([end, metres]);
}

function push(heap, entry) {
  let index = heap.length;
  heap.push(entry);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent][0] <= entry[0]) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = entry;
}

function pop(heap) {
  const first = heap[0];
  const entry = heap.pop();
  if (!heap.length) return first;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++;
    if (entry[0] <= heap[child][0]) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = entry;
  return first;
}

const pathCache = new Map();
export function shortestPath(from, to) {
  const key = from + ":" + to;
  if (pathCache.has(key)) return pathCache.get(key);
  const distance = new Float64Array(nodes.length).fill(Infinity);
  const previous = new Int32Array(nodes.length).fill(-1);
  const frontier = [[0, from]];
  distance[from] = 0;
  while (frontier.length) {
    const [metres, current] = pop(frontier);
    if (metres !== distance[current]) continue;
    if (current === to) break;
    for (const [next, cost] of adjacency[current]) {
      const total = metres + cost;
      if (total < distance[next]) {
        distance[next] = total;
        previous[next] = current;
        push(frontier, [total, next]);
      }
    }
  }
  if (!Number.isFinite(distance[to])) throw new Error("Destination is unreachable");
  const path = [];
  for (let current = to; current !== -1; current = previous[current]) path.push(nodes[current]);
  const result = { km: distance[to] / 1000, path: path.reverse() };
  pathCache.set(key, result);
  return result;
}

export const couriers = [
  { id: "mira", name: "Мира Садыкова", initials: "МС", zone: "Коктем-3", color: "#7054db", pale: "#eee9ff", start: anchor("mira"), speed: 17, capacity: 6 },
  { id: "arman", name: "Арман Алиев", initials: "АА", zone: "Бухар Жырау", color: "#087d72", pale: "#def3ec", start: anchor("arman"), speed: 16, capacity: 6 },
  { id: "dana", name: "Дана Ким", initials: "ДК", zone: "Коктем-1", color: "#275fc4", pale: "#e6efff", start: anchor("dana"), speed: 18, capacity: 6 },
  { id: "timur", name: "Тимур Омаров", initials: "ТО", zone: "КазНУ", color: "#b75421", pale: "#fbeadf", start: anchor("timur"), speed: 17, capacity: 6 },
];

function order(number, owner, title, address, due) {
  return { id: number, owner, title, address, node: anchor(number), due: START + due };
}

export const orders = [
  order("101", "mira", "Музей Кастеева", "Коктем-3", 10),
  order("102", "mira", "Алматинский цирк", "Сатпаева", 16),
  order("103", "mira", "Сатпаева / Байтурсынова", "Сатпаева", 22),
  order("104", "arman", "Ботанический сад", "Тимирязева", 15),
  order("105", "arman", "Тимирязева / Ауэзова", "Тимирязева", 24),
  order("106", "arman", "Коктем-2", "Байзакова", 30),
  order("107", "dana", "Satbayev University", "Коктем-1", 11),
  order("108", "dana", "Сатпаева / Масанчи", "Сатпаева", 18),
  order("109", "dana", "Тимирязева / Байтурсынова", "Бостандыкский район", 29),
  order("110", "timur", "Вход в КазНУ", "Тимирязева", 11),
  order("111", "timur", "Набережная Есентая", "Коктем-1", 20),
  order("112", "timur", "Есентай Парк", "Аль-Фараби", 26),
];

function evaluateRoute(courier, sequence) {
  let time = START;
  let km = 0;
  let previous = courier.start;
  const stops = sequence.map((order, index) => {
    const leg = shortestPath(previous, order.node);
    previous = order.node;
    km += leg.km;
    time += leg.km / courier.speed * 60 + SERVICE;
    const eta = Math.ceil(time);
    return { ...order, sequence: index + 1, courier: courier.id, eta, late: Math.max(0, eta - order.due), leg };
  });
  return { courier, stops, km, late: stops.filter(stop => stop.late > 0).length, delay: stops.reduce((sum, stop) => sum + stop.late, 0) };
}

function compare(a, b) {
  return a.late - b.late || a.delay - b.delay || a.km - b.km;
}

function summarize(routes, unassigned) {
  const stops = routes.flatMap(route => route.stops);
  return {
    routes, stops, unassigned,
    km: routes.reduce((sum, route) => sum + route.km, 0),
    late: routes.reduce((sum, route) => sum + route.late, 0),
    delay: routes.reduce((sum, route) => sum + route.delay, 0),
    moved: stops.filter(stop => stop.owner !== stop.courier).length,
  };
}

export function plan(outage = null, strategy = "deadline") {
  const active = couriers.filter(courier => courier.id !== outage);
  const displaced = orders.filter(order => order.owner === outage);
  const routes = active.map(courier => orders.filter(order => order.owner === courier.id));
  const evaluate = (sequences, unassigned = []) =>
    summarize(active.map((courier, index) => evaluateRoute(courier, sequences[index])), unassigned);
  if (!displaced.length) return evaluate(routes);

  if (strategy === "nearest") {
    const unassigned = [];
    for (const order of displaced) {
      const nearest = active.map((courier, index) => ({ courier, index }))
        .filter(({ courier, index }) => routes[index].length < courier.capacity)
        .sort((a, b) => shortestPath(a.courier.start, order.node).km - shortestPath(b.courier.start, order.node).km)[0];
      if (nearest) routes[nearest.index].push(order);
      else unassigned.push(order);
    }
    return evaluate(routes, unassigned);
  }

  let best;
  const insert = (index, unassigned) => {
    if (index === displaced.length) {
      const result = evaluate(routes, unassigned);
      if (!best || result.unassigned.length < best.unassigned.length
        || result.unassigned.length === best.unassigned.length && compare(result, best) < 0) best = result;
      return;
    }
    const order = displaced[index];
    let added = false;
    for (const [routeIndex, sequence] of routes.entries()) {
      if (sequence.length >= active[routeIndex].capacity) continue;
      for (let position = 0; position <= sequence.length; position++) {
        sequence.splice(position, 0, order);
        insert(index + 1, unassigned);
        sequence.splice(position, 1);
        added = true;
      }
    }
    if (!added) insert(index + 1, [...unassigned, order]);
  };
  insert(0, []);
  return best;
}
