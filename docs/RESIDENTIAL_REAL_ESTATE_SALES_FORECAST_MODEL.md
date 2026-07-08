# Residential Real Estate Sales Forecast Model

This document explains the Residential Real Estate Sales Forecast model, the process used to convert transaction forecasts into revenue, and how FRED macroeconomic data is used in the current implementation.

## Purpose

The Residential Revenue Forecast page helps a real estate company estimate the next 12 months of revenue across four components:

- **Residential GCI** from residential real estate sales
- **Mortgage revenue** from attached mortgage transactions
- **Title revenue** from attached title transactions
- **Insurance revenue** from attached insurance customers

The page is designed for executive planning. It combines a home-sales forecast with editable company assumptions so leadership can test changes in attach rates, revenue per attachment, and GCI economics.

## Where It Lives

In the application:

- Sector: **Real Estate**, sector category `53`
- Operational tab category: **Forecast**
- Report page: **Residential Revenue Forecast**

Key implementation files:

- `app/components/operations/real-estate-forecast/ResidentialRevenueForecast.tsx`
- `lib/operations/real-estate-forecast.ts`
- `lib/operations/real-estate-macro-data.ts`
- `app/api/real-estate-forecast/macro-inputs/route.ts`
- `app/components/operations/OperationsTab.tsx`

## Forecast Outputs

The page produces:

- Top-line metric cards for next 12 month projected revenue
- A multiline revenue chart for Residential GCI, Mortgage, Title, Insurance, and Total Revenue
- Solid chart lines for history and dashed chart lines for forecast periods
- Editable forecast assumptions
- Monthly output table with actual/history rows and forecast rows
- Quarterly summary table
- FRED macro input status

The FRED status line can show:

- `FRED macro inputs: loading`
- `FRED macro inputs: loaded into projection drivers`
- `FRED macro inputs: unavailable, using scenario assumptions`

## Model Overview

The forecast is built in three stages:

1. **Forecast residential transaction volume**
2. **Convert residential sales into Residential GCI**
3. **Apply attach-rate assumptions to estimate Mortgage, Title, and Insurance revenue**

The current implementation uses a deterministic scenario forecast with macroeconomic adjustment factors. It is structured so the home-sales forecast can evolve into a fuller multivariate statistical model as more company-specific history and macro history are connected.

## Stage 1: Residential Home Sales Forecast

The model creates monthly history and forecast rows. Each row includes:

- Existing home sales
- New home sales
- Total home sales
- Low and high forecast ranges
- Period type: `Actual` or `Forecast`

The current baseline sales forecast uses:

- A monthly seasonal curve
- A modest trend factor
- An affordability pressure factor
- FRED macro projection adjustments when available

The key idea is that home sales are the forecast base. All downstream revenue components use projected transaction volume as their starting point.

## FRED Macroeconomic Drivers

FRED data is fetched server-side so the API key is not exposed to the browser.

Production requires:

- `FRED_API_KEY`

The API route is:

- `/api/real-estate-forecast/macro-inputs?periods=12`

The current forecast-driver FRED series include:

- `MORTGAGE30US` - 30-Year Mortgage Rate
- `DGS10` - 10-Year Treasury
- `DGS2` - 2-Year Treasury
- `FEDFUNDS` - Federal Funds Rate
- `UMCSENT` - Michigan Consumer Sentiment
- `NFCI` - National Financial Conditions Index
- `EXPINF1YR` - 1-Year Expected Inflation
- `T10YIE` - 10-Year Breakeven Inflation Rate
- `T5YIFR` - 5-Year, 5-Year Forward Inflation Expectation Rate

The model uses these as explanatory drivers, not as forecast targets. The target remains residential transaction activity.

## How FRED Affects the Forecast

The macro service fetches the latest FRED observations and builds 12 monthly projection inputs.

The projection helper derives:

- Latest 30-year mortgage rate
- Latest 10-year Treasury rate
- Latest 2-year Treasury rate
- Yield curve
- Mortgage spread
- Inflation expectation path
- Implied forward mortgage rate
- Consumer sentiment
- Financial conditions

The residential forecast then applies a macro demand adjustment to projected home sales.

In general:

- Higher implied mortgage rates reduce projected sales volume.
- Near-term inflation expectations above longer-term breakevens reduce projected sales volume.
- Stronger consumer sentiment increases projected sales volume.
- Tighter financial conditions reduce projected sales volume.

The current adjustment is intentionally bounded so macro data influences the forecast without creating extreme swings.

## Stage 2: Residential GCI Revenue

Residential GCI is calculated from projected sales volume.

Inputs:

- Projected total home sales
- Average sale price
- GCI percentage

Formula:

```text
Sales Volume = Total Home Sales x Average Sale Price
Residential GCI = Sales Volume x GCI %
```

The default assumptions are:

- Average sale price: `$441,000`
- GCI percentage: `2.62%`

These assumptions are editable on the page.

## Stage 3: Attached Services Revenue

Attached services are calculated from projected home sales and user-entered attach rates.

Components:

- Mortgage
- Title
- Insurance

Each component uses:

- Quarterly attach rate
- Quarterly attach-rate growth
- Revenue per attached transaction/customer

Formulas:

```text
Mortgage Attachments = Total Home Sales x Mortgage Attach Rate
Mortgage Revenue = Mortgage Attachments x Revenue per Mortgage

Title Attachments = Total Home Sales x Title Attach Rate
Title Revenue = Title Attachments x Revenue per Title

Insurance Attachments = Total Home Sales x Insurance Attach Rate
Insurance Revenue = Insurance Attachments x Revenue per Insurance Customer
```

Default revenue assumptions:

- Revenue per mortgage: `$3,900`
- Revenue per title closing: `$1,850`
- Revenue per insurance customer: `$925`

Default quarterly attach rates:

| Quarter | Mortgage | Title | Insurance |
| --- | ---: | ---: | ---: |
| Q1 | 49% | 58% | 35% |
| Q2 | 50% | 59% | 36% |
| Q3 | 51% | 60% | 37% |
| Q4 | 52% | 61% | 38% |

## Confidence Ranges

Forecast rows include low and high ranges.

The current implementation uses a widening confidence spread during the forecast period:

- Early forecast months have narrower ranges.
- Later forecast months have wider ranges.

This reflects increasing uncertainty farther into the projection window.

## Data Flow

The high-level data flow is:

1. Browser opens `ResidentialRevenueForecast`.
2. Component requests `/api/real-estate-forecast/macro-inputs?periods=12`.
3. API route calls the FRED macro-data service.
4. FRED service fetches selected observations from FRED.
5. FRED service builds 12 monthly macro projection inputs.
6. Forecast utility builds monthly revenue forecast rows.
7. UI renders metric cards, chart, assumptions table, monthly table, and quarterly table.

If FRED is unavailable, the page still works using scenario assumptions. The forecast status will show that macro inputs are unavailable.

## Production Requirements

Production must have this environment variable:

```text
FRED_API_KEY=<FRED API key>
```

After changing the production environment variable, redeploy the app.

To verify production:

```text
https://dashboard.corelytics.com/api/real-estate-forecast/macro-inputs?periods=12
```

Expected response includes:

- `series`
- `projectionInputs`

Then open the Residential Revenue Forecast page and confirm:

```text
FRED macro inputs: loaded into projection drivers
```

## Current Limitations

The current implementation is a strong planning model, but it is not yet a fully trained company-specific statistical model.

Current limitations:

- Historical residential sales are generated from the forecast utility rather than loaded from a company transaction warehouse.
- FRED drivers adjust the projection path, but the model does not yet estimate regression coefficients from historical company sales.
- Attach rates are user-entered assumptions, not yet automatically learned from closed transaction history.
- Low and high ranges are deterministic confidence bands, not model-estimated prediction intervals.

## Recommended Next Enhancements

The next version should connect company-specific history and move from scenario adjustment to a trained multivariate model.

Recommended enhancements:

- Load actual historical residential transactions from Profit Power Enterprise or another brokerage system.
- Store monthly historical home sales, GCI, average sale price, attach rates, and attached-service revenue by company.
- Join historical company sales to lagged FRED macro drivers.
- Train a multivariate time-series or regression model using home sales as the target.
- Use FRED expectation series and market-implied rates as future explanatory variables.
- Persist daily or monthly FRED snapshots so forecasts are reproducible.
- Add scenario controls for mortgage rate, sentiment, and inflation paths.
- Replace deterministic confidence bands with model-based prediction intervals.

## Interpretation Guidance

The forecast should be interpreted as a planning tool, not a guaranteed prediction.

Good uses:

- Board and executive planning
- Revenue scenario analysis
- Attach-rate planning for Mortgage, Title, and Insurance
- Sensitivity analysis around GCI, average sale price, and macro conditions
- Identifying revenue dependence on attached services

Poor uses:

- Treating the output as a precise sales forecast
- Comparing companies without normalizing for market footprint
- Using FRED drivers as direct revenue targets
- Ignoring local market conditions not captured by national macro series

## Summary

The Residential Revenue Forecast model forecasts home-sales-driven company revenue across Residential GCI, Mortgage, Title, and Insurance. It uses editable operating assumptions and server-side FRED macro inputs to shape the forecast period. The current design gives Corelytics a practical forecasting page today while leaving a clear path to a more advanced company-trained multivariate model as transaction history and integration data mature.
