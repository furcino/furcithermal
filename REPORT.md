# What it costs to heat an A1 family house in Bratislava

**A least-cost search over 67,828 system designs.**

The reference building is a 150 m², four-person family house in Bratislava, energy class **A1**
(heat demand for heating ≤ 40.7 kWh/(m²·a) under vyhláška 364/2012 Z. z.). The simulated demand is
**5 575 kWh/a for space heating and 3 667 kWh/a for hot water — 9 242 kWh/a delivered**.

---

## The short answer

| | Cost-optimal | **Recommended** |
|---|---|---|
| Heat source | Condensing gas boiler | **Air-source heat pump** |
| Solar thermal | none | **none** |
| Store | 300 L DHW cylinder | **300 L DHW cylinder** |
| PV | 10 kWp | **7 kWp** |
| Capital, before vouchers | € 17 800 | **€ 22 700** |
| Vouchers (Zelená domácnostiam) | € 4 025 | **€ 8 395** |
| **Net capital** | **€ 13 700** | **€ 14 300** |
| Annualised total cost | **€ 976/a** | **€ 1 018/a** |
| Cost of heat | 10.6 c/kWh | 11.0 c/kWh |
| Purchased energy | 9 730 kWh gas | 2 493 kWh electricity |

The pure cost minimum is a gas boiler with a large PV array. **The heat pump costs € 42/a more —
4 %, comfortably inside the model's error bars — and is the better buy** because it carries no
fossil-fuel exposure (a 50 % gas price rise makes it the outright winner), needs no gas connection,
and is the only one of the two that satisfies the A0 standard now mandatory for new Slovak houses.
That € 42/a is the entire premium for eliminating fossil fuel from the building.

**Solar thermal collectors do not appear in the optimum at any size, with or without subsidy.**
This is the central finding, and it holds across every price scenario tested. Section 5 quantifies it.

---

## 1. Method

The physics model in `index.html` was driven across the design space and every result costed over
its life. Two passes:

- **Global sweep** — 59 520 designs: 6 collector types × 15 areas (0–100 m²) × 3 tilts × 7 storage
  concepts × 8–12 volumes each (0.4–150 000 m³) × 4 backup sources.
- **Focused sweep** — 8 308 designs over the region the first pass identified, with a corrected
  small-store cost curve and an optional PV array (0–10 kWp).

Every design runs four consecutive weather years; the fourth is scored, so buried stores are judged
after the surrounding ground has warmed up.

**Objective:** minimise total annualised cost — capital recovered over each component's own life
at a 4 % real discount rate, plus fuel, plus maintenance, minus PV value.

**Constraint:** the house must never drop below 19 °C and no demand may go unserved. 6 254 of the
8 308 focused designs passed; the rest were undersized solar-only systems.

Reproduce with `node tools/optimise.mjs` and `node tools/solar-fraction-curve.mjs`.

## 2. Prices used

| Item | Value | Basis |
|---|---|---|
| Natural gas | 0.085 €/kWh | D3 tariff 2026, commodity 0.0433–0.0477 €/kWh plus distribution and VAT |
| Electricity, household | 0.210 €/kWh | ~0.196 with *energopomoc*, ~0.258 without |
| Electricity, heat-pump tariff | 0.170 €/kWh | DD5/DD6 |
| PV export | 0.050 €/kWh | conservative |
| Discount rate | 4 % real | 25-year horizon |
| Flat-plate collectors | 290 €/m² installed | plus € 2 000 for pump station, controller, glycol |
| Evacuated tube | 480 €/m² | CPC 520 €/m² |
| DHW cylinder / buffer | 900 + 950·V^0.8 € | € 1 260 for 300 L, € 15 300 for 30 m³ |
| Gas boiler | € 4 500 | incl. flue and connection, 20-year life |
| Air-source heat pump | € 13 000 | installed, 18-year life |
| PV | 1 200 €/kWp | 25-year life |

**Vouchers** (Zelená domácnostiam, family houses, capped at 50 % of eligible cost): heat pump
€ 4 370, solar collectors € 2 300, PV € 4 025 (500–575 €/kW).

PV yield is computed with the same transposition model as the rest of the simulator:
**1 061 kWh/kWp·a** at 35° south for Bratislava.

## 3. The recommended system in detail

**Air-source heat pump + 300 L cylinder + 7 kWp PV. No solar thermal, no seasonal store.**

| | |
|---|---|
| Heat delivered | 9 249 kWh/a (space 5 582, hot water 3 667) |
| Ambient heat lifted | 6 756 kWh/a |
| Electricity consumed | 2 493 kWh/a |
| **Seasonal performance factor** | **3.71** |
| PV generation | 7 427 kWh/a |
| PV self-consumed | ≈ 2 540 kWh/a (34 %) |

### Capital cost — what you pay on top of the house shell

| Item | Cost | Voucher | Net |
|---|---:|---:|---:|
| Air-source heat pump, installed | 13 000 | −4 370 | 8 630 |
| 300 L DHW cylinder + connections | 1 263 | — | 1 263 |
| PV array, 7 kWp, installed | 8 400 | −4 025 | 4 375 |
| **Total heat + power plant** | **22 663** | **−8 395** | **14 268** |

### Annual cost

| | €/a |
|---|---:|
| Capital recovery (4 %, per-component life) | 1 025 |
| Electricity for heating and hot water | 424 |
| Maintenance (HP service, PV) | 245 |
| PV value (self-consumption + export) | −676 |
| **Total annualised cost** | **1 018** |

### Common to every option, excluded from the comparison

These are needed whichever heat source you pick, so they cancel out of the ranking — but they are
real money and they are *not* part of the shell:

| Item | Typical cost |
|---|---:|
| Underfloor heating, 150 m² | € 7 000 – 9 000 |
| MVHR ventilation unit with ducting (effectively required at A1) | € 4 500 – 6 500 |
| Electrical distribution board, HP tariff switch | € 300 – 600 |
| **Subtotal** | **€ 12 000 – 16 000** |

So the realistic **all-in figure for heating, hot water, ventilation and power generation on an
A1 house is roughly € 26 000 – 30 000 before vouchers, € 18 000 – 22 000 after.**

## 4. The alternatives, ranked

Total annualised cost, best PV size chosen for each, vouchers applied:

| System | TAC €/a | Capex € | Purchased energy | Cost of heat |
|---|---:|---:|---|---:|
| Gas boiler + 10 kWp PV | **976** | 17 763 | 9 730 kWh gas | 10.6 c/kWh |
| **Heat pump + 7 kWp PV** | **1 018** | 22 663 | 2 493 kWh el | 11.0 c/kWh |
| Flat plate 8 m² + gas + 10 kWp PV | 1 071 | 22 266 | 6 870 kWh gas | 11.6 c/kWh |
| Flat plate 6 m² + heat pump + 5 kWp PV | 1 275 | 24 000 | 1 900 kWh el | 13.8 c/kWh |
| Direct electric + 10 kWp PV | 1 310 | 15 063 | 9 242 kWh el | 14.2 c/kWh |
| Flat plate 30 m² + 1 m³ + HP + 10 kWp PV | 1 886 | 40 900 | 1 359 kWh el | 20.5 c/kWh |

Without any subsidy the ordering is unchanged: gas + PV € 1 240, heat pump + PV € 1 559, gas alone
€ 1 387, heat pump alone € 1 720, direct electric € 2 182.

## 5. Why solar thermal loses

Adding collectors to the recommended system, each row the cheapest configuration at that size:

| Collector area | Store | Solar fraction | Extra cost €/a | Summer heat dumped |
|---:|---:|---:|---:|---:|
| 0 m² | 300 L | 0 % | — | 0 |
| 4 m² | 300 L | 55 % | +263 | 0 |
| 8 m² | 500 L | 65 % | +296 | 234 kWh |
| 12 m² | 1 m³ | 70 % | +382 | 480 kWh |
| 20 m² | 4 m³ | 76 % | +635 | 807 kWh |
| 40 m² | 15 m³ | 84 % | +1 279 | 2 180 kWh |
| 80 m² | 50 m³ | 94 % | +2 665 | 4 940 kWh |

> **Reading the solar fraction with a heat pump.** The jump to 55 % at 4 m² is real but flattering:
> the metric counts *all* heat drawn out of the store, and with a heat pump the store is the
> evaporator source. Much of that is low-temperature ambient energy the collector would have
> harvested anyway. Judge these rows by the euro column and by purchased kWh, not by the percentage.

The economics are simple. Every kWh a collector displaces is a kWh the heat pump would have
supplied at an SPF of 3.7 — that is, for about 4.6 cents of electricity. Solar heat from a
€ 290/m² collector, over a 25-year life, costs more than that. **The heat pump has already taken
the cheap heat.** Against gas the margin is narrower (8.9 c/kWh of delivered heat), which is why
the 8 m² DHW system is only € 98/a worse than gas alone rather than € 263/a — but it still never
turns positive.

Nor is the collector choice the problem. The best system for every collector type lands within
€ 40/a of the others; evacuated tubes buy slightly more heat per m² and cost proportionally more.

## 6. Why seasonal storage fails at house scale

The surface of a store grows as the square of its size while its capacity grows as the cube, so
losses per stored kWh fall only as the store gets huge. One house cannot get there.

| Store concept | Best design found | TAC €/a | Cost of heat |
|---|---|---:|---:|
| Indoor tank (small, DHW only) | 4 m², 300 L | **1 457** | 15.8 c/kWh |
| Insulated sand bed | 8 m², 20 m³ | 2 010 | 21.8 c/kWh |
| Paraffin PCM | 6 m², 3 m³ | 2 135 | 23.3 c/kWh |
| Buried water tank | 6 m², 10 m³ | 2 168 | 23.5 c/kWh |
| Borehole field (BTES) | 3 m², 1 000 m³ | 2 982 | 32.3 c/kWh |
| Water pit store (PTES) | 30 m², 150 m³ | 3 298 | 35.7 c/kWh |
| Gravel–water pit (PTES) | 20 m², 150 m³ | 3 337 | 36.1 c/kWh |

*(unsubsidised, PV allowed)*

The genuinely seasonal designs — those reaching 90 %+ solar fraction — cost **€ 2 600 – 3 300/a**
against € 1 240 for the cost-optimal system. Over 25 years that is roughly **€ 35 000 – 50 000 of
extra cost to avoid about € 800/a of fuel.**

BTES is the clearest illustration: at 1 000 m³ — already a serious drilling job — the field loses
essentially everything it is given and returns a 0 % solar fraction. It is a community-scale
technology, and the simulator shows exactly why.

**None of this means seasonal storage is a bad idea in general.** Vojens and Marstal in Denmark
work because thousands of dwellings share one pit. The conclusion is narrower and firmer: *for a
single A1 house, at Slovak 2026 prices, the store can never be big enough to be cheap.*

## 7. When the answer changes

| Scenario | Winner | TAC €/a |
|---|---|---:|
| Base case | gas + 10 kWp PV | 976 |
| **Gas +50 %** | **heat pump + PV** | 1 559 |
| Gas −30 % | gas + PV | 992 |
| Electricity +30 % | gas + PV | 1 073 |
| Electricity −25 % | gas + 3 kWp PV | 1 329 |
| Discount rate 2 % | gas + 10 kWp PV | 1 013 |
| Discount rate 7 % | gas + 3 kWp PV | 1 451 |
| Heat pump capex −30 % | unchanged ordering, HP gap closes to ~€ 10/a | — |
| Solar thermal capex −40 % | **still no collectors in the optimum** | — |

Solar thermal does not enter the optimum even at 40 % off. It would need to roughly halve in
installed cost *and* be paired with a gas boiler rather than a heat pump.

The PV sizing is the softest number here. 10 kWp wins only because export is valued at 5 c/kWh; at
a lower export price or a higher discount rate the optimum drops to 3 kWp. **A robust choice is
5–7 kWp**, sized to the household's own consumption, which is also where the voucher caps out.

## 8. Caveats

- Daily time steps with four sub-steps, one store node, one house node. Good for ranking options;
  a real design needs hourly simulation (TRNSYS, Polysun) and a measured load profile.
- PV self-consumption is estimated from an annual ratio, not hourly matching. Heat-pump demand
  peaks in winter when PV output is lowest, so the PV credit here is, if anything, optimistic —
  which works against the heat pump, not for it.
- Installed prices are market estimates, not quotations. Collector and heat-pump prices vary ±30 %
  between installers, which is larger than the € 42/a gap between the top two systems.
- The heat pump is modelled as air-source with a fallback below 8 °C. A ground-source unit would
  raise the SPF to roughly 4.5 and cost € 6 000 – 9 000 more in drilling.
- Vouchers are competitive and time-limited; the unsubsidised numbers in section 4 are the safe
  planning basis.
- Gas price risk is not symmetric. Slovak 2026 household gas prices already rose sharply where
  *energopomoc* did not apply, and a gas boiler installed today faces a 20-year exposure to that.

## 9. Bottom line

For a new A1 house in Bratislava, spend the money on **the building envelope, a heat pump and PV** —
in that order. The A1 fabric has already cut the heating demand to 5 575 kWh/a; at that level the
remaining bill is small enough that no heat-generating equipment pays back against a heat pump
running at SPF 3.7.

Seasonal solar thermal storage is a beautiful piece of engineering and the simulator in this
repository shows it working — a 30 m³ tank really does carry a house from August to February.
It just costs about twice as much as not doing it.

---

*Sources for prices: [Slovak Spectator on 2026 energy prices](https://spectator.sme.sk/business/c/living-in-slovakia-your-2026-energy-bill-depends-on-one-thing-state-aid) ·
[SPP / ÚRSO 2026 gas tariffs](https://www.energie-portal.sk/Dokument/ceny-plynu-cennik-spp-2026-urso-111983.aspx) ·
[GlobalPetrolPrices — Slovakia electricity](https://www.globalpetrolprices.com/Slovakia/electricity_prices/) ·
[Zelená domácnostiam voucher amounts](https://www.solarneslovensko.sk/dotacie/) ·
[Slovak energy classes](https://www.stavbadomunakluc.sk/trieda-domu-a0-a1-primarna-energia-globalny-ukazovatel/)*
