# Dispatch Map · Routing Evaluation

## Question

When a courier drops out at the start of a shift, does inserting the affected orders into existing routes reduce late deliveries compared with assigning them to the nearest courier?

## Setup

- The [road graph](dist/almaty-data.mjs) contains 7,563 nodes and 15,189 directed edges derived from OpenStreetMap in Almaty, near Esentai, Koktem, KazNU, and the Botanical Garden.
- The starting plan has four couriers and 12 orders. The simulation starts at 10:00 and adds three minutes of service time per stop. Each courier has a fixed speed and a capacity of six orders.
- Each trial removes one courier at 10:00 and reassigns that courier's three orders. The other couriers retain their existing assignments and the relative order of those stops.

**Nearest courier** selects the eligible courier whose starting point is closest by road and appends the order to the end of that route. **Deadline-aware insertion** searches possible placements and ranks them by unassigned orders, late orders, total late minutes, then distance. Both strategies use the same directed graph and shortest-path distances.

## Results

The starting plan covers **10.334 km**, with all 12 orders on time. Both strategies assign all 12 orders in every outage trial.

| Courier removed | Late orders, nearest | Late orders, by deadline | Late minutes, nearest | Late minutes, by deadline | Distance, nearest | Distance, by deadline |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mira | 3 | 2 | 38 | 30 | 10.921 km | 11.096 km |
| Arman | 3 | 1 | 31 | 5 | 11.620 km | 12.912 km |
| Dana | 2 | 2 | 26 | 26 | 10.259 km | 10.149 km |
| Timur | 3 | 2 | 30 | 24 | 11.016 km | 13.422 km |
| **Sum across four independent trials** | **11** | **7** | **125** | **85** | **43.816 km** | **47.579 km** |

Deadline-aware insertion reduced total lateness by **40 minutes across the four trials (32%)**, with **3.763 km of additional travel**. It reduced late orders in three trials. In Dana's trial, it matched the baseline on lateness and covered slightly less distance.

### Example · Mira drops out

| Order | Deadline | Nearest courier · ETA | Deadline-aware · ETA |
| --- | --- | --- | --- |
| #101 · Kasteev Museum | 10:10 | Dana · 10:26 | Timur · 10:28 |
| #102 · Almaty Circus | 10:16 | Arman · 10:28 | Arman · 10:28 |
| #103 · Satpayev / Baitursynov | 10:22 | Dana · 10:32 | Dana · 10:05 |

The deadline-aware plan puts #103 near the front of Dana's route and brings it in on time. It also makes #101 two minutes later. The result shows the trade-off behind the objective. The planner favors fewer late deliveries across the shift, and an individual order can arrive later.

## Reproduce

Run from the repository root. The road graph ships with the project, and Node.js can run the comparison offline.

```sh
node --input-type=module -e '
import { couriers, plan } from "./dist/engine.mjs";
const results = couriers.flatMap(({ id }) =>
  ["nearest", "deadline"].map(strategy => {
    const result = plan(id, strategy);
    return {
      outage: id,
      strategy,
      lateOrders: result.late,
      lateMinutes: result.delay,
      distanceKm: result.km.toFixed(3),
      unassigned: result.unassigned.length
    };
  })
);
console.table(results);
'
node --test tests/engine.test.mjs
```

The tests cover directed road paths, distance accounting, capacity, preservation of existing assignments, and deterministic replanning.

## Scope

These results describe four fixed, simulated outages at shift start. The graph represents real streets, while courier positions, orders, speeds, and deadlines are demo inputs. The estimates omit live traffic, elevation, and intersection turn restrictions. The exhaustive insertion search is sized for the three displaced orders in this scenario.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
