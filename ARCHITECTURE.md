# Arquitectura, escalabilidad y seguridad (pitch)

Estos diagramas están escritos para **explicar el MVP como si fuera un “core bancario ligero”**: cada promoción entra como una **orden**, pasa por **controles de riesgo**, queda **trazada**, y se distribuye por un **switch realtime** con políticas (geofence).

## Diagrama de arquitectura (alto nivel)

```mermaid
flowchart TB
  subgraph FE["Frontends (Next.js + TS)"]
    NEG["de-una-negocio<br/>Backoffice Comercios<br/>(Vercel)"]:::fe
    YAP["de-una (YaPass)<br/>Canal Clientes<br/>(Vercel)"]:::fe
  end

  subgraph CORE["Core Realtime (Fastify)"]
    API["de-una-api<br/>Validación (schema) + reglas<br/>(Fly.io 1 máquina)"]:::be
    BUS["SSE /campaigns/stream<br/>fanout + geofence"]:::be
    MEM["In-memory store<br/>campañas activas"]:::db
  end

  NEG -->|"POST /campaigns (orden)"| API
  API -->|"save(campaign)"| MEM
  API -->|"broadcast(campaign)"| BUS
  YAP -->|"EventSource (SSE subscribe)"| BUS
  BUS -->|"event: campaign"| YAP

  classDef fe fill:#eef2ff,stroke:#4338ca,color:#111827;
  classDef be fill:#ecfeff,stroke:#0891b2,color:#111827;
  classDef db fill:#f0fdf4,stroke:#16a34a,color:#111827;
```

## Diagrama de escalabilidad (hoy → mañana, sin reescribir)

```mermaid
flowchart LR
  subgraph Today["MVP (hoy)"]
    FE1["Fronts en Vercel<br/>de-una / de-una-negocio"]:::fe
    API1["Fly.io (1 máquina)<br/>de-una-api<br/>SSE + memoria"]:::be
    FE1 -->|"HTTPS (POST/GET)"| API1
    FE1 -->|"SSE (EventSource)"| API1
  end

  subgraph Tomorrow["Escala (mañana)"]
    FE2["Fronts (Vercel)"]:::fe
    EDGE["Edge / LB / WAF<br/>TLS termination + rate limit"]:::sec

    API2["API stateless (N réplicas)<br/>Fastify"]:::be
    STREAM["Pub/Sub (NATS/Redis Streams/Kafka)<br/>fanout global"]:::db
    REDIS["Redis (estado + dedupe + presence)"]:::db
    DB["Postgres (campañas + auditoría)"]:::db

    FE2 --> EDGE
    EDGE --> API2
    API2 --> DB
    API2 --> REDIS
    API2 --> STREAM
    STREAM --> API2
  end

  Today -->|"migración gradual"| Tomorrow

  classDef fe fill:#eef2ff,stroke:#4338ca,color:#111827;
  classDef be fill:#ecfeff,stroke:#0891b2,color:#111827;
  classDef db fill:#f0fdf4,stroke:#16a34a,color:#111827;
  classDef sec fill:#fff7ed,stroke:#ea580c,color:#111827;
```

## Diagrama de seguridad + antifraude (enterprise “humo” pero coherente)

```mermaid
flowchart TB
  subgraph Channels["Canales"]
    BO["Backoffice Comercio (de-una-negocio)<br/>Origen de la orden"]:::fe
    APP["Canal Cliente (de-una / YaPass)<br/>Consumo de eventos"]:::fe
  end

  subgraph Perimeter["Perímetro (controles)"]
    TLS["TLS / HTTPS-only<br/>HSTS"]:::sec
    WAF["WAF + Rate limiting<br/>anti-bot / anti-spam"]:::sec
    CORS["CORS allowlist<br/>Vercel + dominios permitidos"]:::sec
  end

  subgraph Core["Core Promociones (de-una-api)"]
    INTAKE["INTAKE / API Gateway<br/>validación de contrato (schema)"]:::be
    RISK["RISK ENGINE (anti-fraude)\n- velocity rules\n- dedupe/replay\n- geofence policy\n- anomaly checks"]:::sec
    LEDGER["Event Ledger (MVP in-memory)\ncreatedAt/expiresAt + estado activo"]:::db
    SWITCH["Realtime Switch (SSE)\nfanout + segmentación geográfica"]:::be
    AUDIT["Observabilidad / Auditoría\ncampaignId, businessId, delivered\nhealth + logs"]:::sec
  end

  BO -->|"POST /campaigns (orden)"| TLS --> WAF --> CORS --> INTAKE
  INTAKE --> RISK
  RISK -->|"approve"| LEDGER
  LEDGER -->|"publish"| SWITCH
  APP -->|"SSE subscribe"| TLS --> WAF --> CORS --> SWITCH
  SWITCH -->|"event: campaign"| APP

  RISK --> AUDIT
  SWITCH --> AUDIT

  classDef fe fill:#eef2ff,stroke:#4338ca,color:#111827;
  classDef be fill:#ecfeff,stroke:#0891b2,color:#111827;
  classDef db fill:#f0fdf4,stroke:#16a34a,color:#111827;
  classDef sec fill:#fff7ed,stroke:#ea580c,color:#111827;
```

## Talking points “vendibles” (anti‑fraude)

- **Órdenes transaccionales**: una promo no es “un post”; es una **orden** que entra al core con contrato y validación.
- **Risk Engine**: antes de emitir, se aplican **controles de riesgo** (velocity, dedupe/replay, anomalías, geofence).
- **Switch realtime**: la entrega no es “broadcast”; es un **switch** que enruta por políticas (segmentación geográfica).
- **Trazabilidad**: cada emisión tiene `campaignId` y métricas de entrega (`delivered`, `subscribers`) para auditoría operativa.
- **Evolución enterprise**: in-memory → Postgres + Redis + Pub/Sub sin rehacer los canales.

