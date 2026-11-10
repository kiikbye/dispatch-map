import { CITY, couriers, nodes, orders, plan } from "./engine.mjs";

const $ = id => document.getElementById(id);
const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const km = value => value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const time = value => String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
const orderCount = value => value + " " + (value % 10 === 1 && value % 100 !== 11 ? "заказ" :
  value % 10 >= 2 && value % 10 <= 4 && !(value % 100 >= 12 && value % 100 <= 14) ? "заказа" : "заказов");
const paint = courier => 'style="--route-color:' + courier.color + ';--route-pale:' + courier.pale + '"';
const points = items => items.map(({ x, y }) => x.toFixed(1) + "," + y.toFixed(1)).join(" ");
const courierById = new Map(couriers.map(courier => [courier.id, courier]));

const state = { selected: "mira", order: null, outage: null, strategy: "deadline", filter: "all" };
const cache = new Map();
const baseline = plan();
function getPlan(strategy = state.strategy) {
  if (!state.outage) return baseline;
  const key = state.outage + ":" + strategy;
  if (!cache.has(key)) cache.set(key, plan(state.outage, strategy));
  return cache.get(key);
}

function renderMap(current) {
  const ordered = [...current.routes].sort((a, b) => Number(a.courier.id === state.selected) - Number(b.courier.id === state.selected));
  $("routes").innerHTML = ordered.map(route => {
    if (!route.stops.length) return "";
    const track = points(route.stops.flatMap(({ leg }, index) => index ? leg.path.slice(1) : leg.path));
    const selected = route.courier.id === state.selected;
    const width = selected ? 5.5 : 4;
    const movedTrack = route.stops.filter(stop => stop.courier !== stop.owner).map(({ leg }) =>
      '<polyline points="' + points(leg.path) + '" fill="none" stroke="#ffffffb8" stroke-width="1.1" stroke-dasharray="2 7"/>').join("");
    return '<g stroke-linecap="round" stroke-linejoin="round" opacity="' + (selected ? 1 : .88) + '">' +
      '<polyline points="' + track + '" fill="none" stroke="#fff" stroke-width="' + (width + 3) + '"/>' +
      '<polyline points="' + track + '" fill="none" stroke="' + route.courier.color + '" stroke-width="' + width + '"/>' + movedTrack + '</g>';
  }).join("");

  const stops = [...current.stops, ...current.unassigned];
  const stopMarkers = stops.map(stop => {
    const { x, y } = nodes[stop.node];
    const courier = courierById.get(stop.courier);
    const warn = stop.late > 0 || !courier;
    const active = state.order === stop.id;
    const color = warn ? "#b75421" : courier.color;
    return '<g class="map-marker" tabindex="0" role="button" aria-label="Заказ ' + stop.id + ', ' + stop.title +
      (warn ? ', под риском' : '') + '" aria-pressed="' + active + '" data-order="' + stop.id +
      '" data-focus="marker-order-' + stop.id + '" transform="translate(' + x + ',' + y + ')">' +
      '<title>' + stop.title + '</title><circle r="18" fill="transparent"/>' +
      (active ? '<circle r="17" fill="#eee7ff" stroke="#a58be9" stroke-width="1.2"/>' : '') +
      '<circle class="marker-ring" r="10" fill="' + (warn ? "#fff1e2" : "#fff") + '" stroke="' + color + '" stroke-width="2.3"/>' +
      '<text y="3.1" text-anchor="middle" fill="' + color + '" font-size="8.4" font-weight="800">' + (warn ? "!" : stop.sequence) + '</text></g>';
  }).join("");

  const courierMarkers = couriers.map(courier => {
    const { x, y } = nodes[courier.start];
    const offline = courier.id === state.outage;
    const selected = courier.id === state.selected;
    const color = offline ? "#726775" : courier.color;
    return '<g class="map-marker" tabindex="0" role="button" aria-label="' + courier.name + (offline ? ', вне смены' : '') +
      '" aria-pressed="' + selected + '" data-courier="' + courier.id + '" data-focus="marker-courier-' + courier.id +
      '" transform="translate(' + x + ',' + y + ')"><title>' + courier.name + '</title>' +
      (selected ? '<circle r="22" fill="' + courier.pale + '" fill-opacity=".82" stroke="' + color + '" stroke-opacity=".4"/>' : '') +
      '<rect class="marker-ring" x="-15" y="-14" width="30" height="28" rx="9" fill="' + color + '" stroke="white" stroke-width="2.5"/>' +
      '<text y="3.6" text-anchor="middle" fill="#fff" font-size="10" font-weight="800">' + (offline ? "×" : courier.initials) + '</text></g>';
  }).join("");
  $("markers").innerHTML = stopMarkers + courierMarkers;

  const popup = $("map-selection");
  const order = stops.find(stop => stop.id === state.order);
  popup.hidden = !order;
  if (order) popup.innerHTML = icon("pin") + '<span><strong>' + order.title + '</strong> · ' + order.address + ' · ' +
    (order.eta ? time(order.eta) + ' / к ' + time(order.due) : 'без курьера') + '</span>';
}

function renderKpis(current) {
  const risk = current.late + current.unassigned.length;
  const card = (label, value, suffix, description, symbol, theme) => '<article class="kpi"><div class="kpi-icon ' + theme + '">' +
    icon(symbol) + '</div><div><p class="kpi-label">' + label + '</p><p class="kpi-value">' + value +
    (suffix ? '<small>' + suffix + '</small>' : '') + '</p><p class="kpi-note">' + description + '</p></div></article>';
  $("kpis").innerHTML = [
    card("Заказы смены", orders.length, "", state.outage ? "Передано " + orderCount(current.moved) : "Все заказы распределены", "box", ""),
    card("Под риском", risk, "", risk ? current.delay + " мин суммарной задержки" : "Все доставки к сроку", "clock", risk ? "amber" : "green"),
    card("Курьеры на линии", current.routes.length, "/ " + couriers.length, state.outage ? "1 курьер вне смены" : "Полный состав", "bike", "green"),
    card("Длина маршрутов", km(current.km), "км", state.outage ? (current.km >= baseline.km ? "+" : "−") + km(Math.abs(current.km - baseline.km)) + " км к исходному плану" : "По дорожной сети", "route", "blue"),
  ].join("");
}

function renderFleet(current) {
  $("fleet-count").textContent = current.routes.length;
  $("fleet").innerHTML = couriers.map(courier => {
    const route = current.routes.find(item => item.courier.id === courier.id);
    const selected = courier.id === state.selected;
    return '<button type="button" class="courier-row' + (route ? "" : " offline") + '" aria-pressed="' + selected +
      '" data-courier="' + courier.id + '" data-focus="fleet-' + courier.id + '" ' + paint(courier) + '><span class="avatar">' + courier.initials +
      '</span><span><span class="courier-name">' + courier.name + '</span><span class="courier-zone">' + courier.zone +
      '</span></span><span class="courier-metric' + (!route || route.late ? " warn" : "") + '"><b>' +
      (route ? orderCount(route.stops.length) : "Вне смены") + '</b>' +
      (route ? (route.late ? route.late + " под риском" : km(route.km) + " км") : "Сбой") + '</span></button>';
  }).join("");

  const active = courierById.get(state.selected);
  $("scenario").innerHTML = state.outage ? '<h3>' + icon("zap") + ' Перераспределение</h3><p><strong>' +
    courierById.get(state.outage).name + '</strong> вне смены. Передано ' + orderCount(current.moved) +
    (current.unassigned.length ? ', без курьера ' + current.unassigned.length : '') + '.</p><div class="comparison">' +
    [["deadline", "По срокам"], ["nearest", "Ближайший"]].map(([strategy, name]) => {
      const result = getPlan(strategy);
      return '<button type="button" class="compare-card" aria-pressed="' + (state.strategy === strategy) +
        '" data-strategy="' + strategy + '" data-focus="compare-' + strategy + '"><span>' + name +
        '</span><b>' + (result.late + result.unassigned.length) + ' под риском</b><span>' + km(result.km) + ' км</span></button>';
    }).join("") + '</div>' :
    '<h3>' + icon("zap") + ' Проверьте план при сбое</h3><p>Выбранный курьер — <strong>' +
    active.name + '</strong>. При сбое заказы перейдут к оставшимся курьерам.</p><p class="compare-caption">Обе стратегии сравниваются на одних и тех же заказах.</p>';
}

function renderOrders(current) {
  const rows = [...current.stops, ...current.unassigned].sort((a, b) => a.id.localeCompare(b.id)).filter(stop => {
    if (state.filter === "late") return !stop.courier || stop.late > 0;
    if (state.filter === "moved") return stop.courier && stop.courier !== stop.owner;
    return true;
  });
  $("orders").innerHTML = rows.map(stop => {
    const courier = courierById.get(stop.courier);
    const moved = courier && stop.owner !== stop.courier;
    return '<tr' + (stop.id === state.order ? ' class="current"' : '') + '><td><button class="order-button" type="button" aria-pressed="' +
      (stop.id === state.order) + '" data-order="' + stop.id + '" data-focus="table-order-' + stop.id + '">' + icon("pin") +
      '<span class="order-id">#' + stop.id + '</span><strong>' + stop.title + '</strong></button></td><td>' +
      (courier ? '<span class="courier-label" ' + paint(courier) + '><i></i>' + courier.name + '</span>' : "—") +
      '</td><td>' + time(stop.due) + '</td><td>' + (courier ? time(stop.eta) : "—") + '</td><td>' +
      (courier ? stop.late ? '<span class="badge warn">+' + stop.late + ' мин</span>' : '<span class="badge">Вовремя</span>'
        : '<span class="badge warn">Без курьера</span>') +
      (moved ? '<span class="badge moved">Передан</span>' : '') + '</td></tr>';
  }).join("") || '<tr><td class="empty" colspan="5">В этом фильтре пока нет заказов.</td></tr>';
}

function render(message = "") {
  const focus = document.activeElement?.dataset?.focus;
  const current = getPlan();
  renderKpis(current);
  renderMap(current);
  renderFleet(current);
  renderOrders(current);
  $("outage").querySelector("span").textContent = state.outage ? "Вернуть курьера" : "Сбой курьера";
  $("outage").setAttribute("aria-label", state.outage ? "Вернуть курьера в смену" : "Сбой курьера, " + courierById.get(state.selected).name);
  document.querySelector('input[name="strategy"][value="' + state.strategy + '"]').checked = true;
  document.querySelector('input[name="filter"][value="' + state.filter + '"]').checked = true;
  if (message) $("live").textContent = message;
  if (focus) document.querySelector('[data-focus="' + focus + '"]')?.focus({ preventScroll: true });
}

const map = $("map");
const view = { scale: 1, x: 0, y: 0 };
let drag = null;
let ignoreClick = false;
function showView() {
  const width = CITY.width / view.scale, height = CITY.height / view.scale;
  view.x = Math.max(0, Math.min(CITY.width - width, view.x));
  view.y = Math.max(0, Math.min(CITY.height - height, view.y));
  map.setAttribute("viewBox", [view.x, view.y, width, height].join(" "));
  map.classList.toggle("pannable", view.scale > 1);
  $("zoom-in").disabled = view.scale >= 2.4;
  $("zoom-out").disabled = view.scale <= 1;
  $("zoom-fit").disabled = view.scale === 1;
  $("scale-line").style.width = Math.round(Math.min(map.clientWidth / width, map.clientHeight / height) * 500 / CITY.metresPerPixel) + "px";
}
function zoom(scale) {
  const old = view.scale;
  view.scale = Math.max(1, Math.min(2.4, scale));
  view.x += (CITY.width / old - CITY.width / view.scale) / 2;
  view.y += (CITY.height / old - CITY.height / view.scale) / 2;
  showView();
}
function fit() { Object.assign(view, { x: 0, y: 0, scale: 1 }); showView(); }
$("zoom-in").addEventListener("click", () => zoom(view.scale * 1.28));
$("zoom-out").addEventListener("click", () => zoom(view.scale / 1.28));
$("zoom-fit").addEventListener("click", fit);
window.addEventListener("resize", showView);

map.addEventListener("pointerdown", event => {
  if (view.scale === 1 || event.button !== 0 || event.target.closest(".map-marker")) return;
  const pixel = Math.min(map.clientWidth / CITY.width, map.clientHeight / CITY.height) * view.scale;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: view.x, startY: view.y, pixel };
  map.setPointerCapture(event.pointerId);
  map.classList.add("dragging");
});
map.addEventListener("pointermove", event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  ignoreClick ||= Math.abs(dx) + Math.abs(dy) > 4;
  view.x = drag.startX - dx / drag.pixel;
  view.y = drag.startY - dy / drag.pixel;
  showView();
});
for (const eventName of ["pointerup", "pointercancel"]) {
  map.addEventListener(eventName, () => {
    drag = null;
    map.classList.remove("dragging");
    if (ignoreClick) setTimeout(() => { ignoreClick = false; }, 0);
  });
}

function select(element) {
  if (element.dataset.courier) {
    state.selected = element.dataset.courier;
    state.order = null;
    render("Курьер выбран: " + courierById.get(state.selected).name);
  } else if (element.dataset.order) {
    const stop = getPlan().stops.find(item => item.id === element.dataset.order);
    state.order = state.order === element.dataset.order ? null : element.dataset.order;
    if (stop && state.order) state.selected = stop.courier;
    if (state.order) {
      const point = nodes[orders.find(order => order.id === state.order).node];
      view.x = point.x - CITY.width / view.scale / 2;
      view.y = point.y - CITY.height / view.scale / 2;
      showView();
    }
    render();
  } else if (element.dataset.strategy) {
    state.strategy = element.dataset.strategy;
    render("Стратегия изменена. Заказов под риском: " + getPlan().late);
  }
}
document.addEventListener("click", event => {
  if (ignoreClick) return;
  const element = event.target.closest("[data-order], [data-courier], [data-strategy]");
  if (element) select(element);
});
map.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".map-marker")) {
    event.preventDefault();
    select(event.target);
  }
});
document.addEventListener("change", event => {
  if (event.target.name === "strategy") state.strategy = event.target.value;
  else if (event.target.name === "filter") state.filter = event.target.value;
  else return;
  render();
});
$("outage").addEventListener("click", () => {
  state.outage = state.outage ? null : state.selected;
  state.order = null;
  state.filter = "all";
  render(state.outage ? "Сбой смоделирован. Передано заказов: " + getPlan().moved : "Курьер вернулся. Исходный план восстановлен.");
});
$("reset").addEventListener("click", () => {
  Object.assign(state, { selected: "mira", order: null, outage: null, strategy: "deadline", filter: "all" });
  fit();
  render("Сценарий сброшен.");
});

map.closest(".map-wrap").style.setProperty("--map-ratio", CITY.width + " / " + CITY.height);
const background = $("base-map");
background.setAttribute("width", CITY.width);
background.setAttribute("height", CITY.height);
render();
showView();
