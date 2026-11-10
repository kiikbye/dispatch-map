# Dispatch Map

An interactive dispatch simulator that reroutes deliveries when a courier drops out. It covers a real section of Almaty around the Esentai River, Koktem, Al-Farabi Kazakh National University, and the Botanical Garden. Couriers, orders, and deadlines are simulated. The Russian-language dashboard shows projected arrival times, late deliveries, route distance, and reassigned orders.

## Run

```sh
python -m http.server 8080 --directory dist
```

Open [localhost:8080](http://localhost:8080). The demo uses static files and has no external runtime dependencies.

## Demo

1. Select a courier in the roster or on the map. Press **Сбой курьера** to simulate an outage at the start of the shift.
2. Compare **По срокам** (deadline-aware insertion) and **Ближайший** (nearest courier) using the same outage and initial routes.
3. Open **Переданы** to see which orders moved. Select an order to see its stop and projected arrival.
4. Press **Вернуть курьера** to restore the initial routes, or **Сбросить** to reset the entire demo.

With Mira's default outage, deadline-aware insertion produces 2 late deliveries and 30 total late minutes. Nearest courier produces 3 late deliveries and 38 total late minutes in the same simulated shift. In this scenario, the shorter-delay plan covers 11.10 km compared with 10.92 km for the nearest-courier plan.

[Read the evaluation report](REPORT.md) for the comparison across all four courier outages and the commands to reproduce it.

## Routing model

Dijkstra's algorithm finds shortest paths in the connected portion of a directed graph derived from OpenStreetMap roads and bicycle paths. The graph respects access and one-way tags at the way level. Couriers have fixed speeds and room for at most six deliveries. Each stop adds three minutes of service time. The baseline assigns each displaced order to the nearest eligible courier's starting location and appends it to their route.

The deadline-aware strategy enumerates insertions for the three displaced orders. Existing deliveries retain their courier and relative stop order. Candidate plans are ranked by unassigned orders, late deliveries, total late minutes, and distance. This exhaustive search is sized for the demo scenario of one simultaneous outage. Arrival estimates use a single start time and fixed courier speeds. Real conditions such as traffic, gradient, and turn restrictions can change delivery times.

## Map data

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The map data in [almaty-data.mjs](dist/almaty-data.mjs) and the underlying geometry in [almaty-base.svg](dist/almaty-base.svg) are available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The source extract covers longitude 76.898–76.943 and latitude 43.2195–43.243. The derived map and road graph are bundled, so the demo serves both from the same origin. To regenerate them, save the [OpenStreetMap extract](https://api.openstreetmap.org/api/0.6/map.json?bbox=76.898,43.2195,76.943,43.243) as `almaty-source.json` and run `python scripts/build_almaty.py almaty-source.json` from the project directory.

## Tests

```sh
node --test tests/engine.test.mjs
```
