-- Design notes:
-- * Orders can be LIMIT (limit_price provided) or MARKET (limit_price = NULL).
--   For LIMIT orders: reserved funds = quantity * limit_price.
--   For MARKET orders: uses current market price when filled.
--   Available balance is computed dynamically (cash_balance minus the sum of open BUY orders)
--   rather than stored, so the same query path can later absorb other checks
--   (e.g. trade limits) without a denormalized column to keep in sync.
-- * instrument_prices holds periodic (~15 min) pulls from the pricing API. It's only consumed
--   by the EOD historical_snapshot job and portfolio valuation reads — never by order placement.
-- * orders never need created_by/approved_by: the client is always both creator and submitter.

CREATE TYPE admin_role AS ENUM (
    'ADMIN',
    'ANALYST'
);

CREATE TYPE account_status AS ENUM (
    'ACTIVE',
    'RESTRICTED',
    'SUSPENDED',
    'CLOSED'
);

CREATE TYPE asset_class AS ENUM (
    'STOCK',
    'ETF',
    'MUTUAL_FUND'
);

CREATE TYPE order_type AS ENUM (
    'BUY',
    'SELL'
);

CREATE TYPE order_status AS ENUM (
    'PENDING',
    'FILLED',
    'CANCELLED',
    'REJECTED'
);

CREATE TYPE transaction_type AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL'
);

CREATE TYPE portfolio_size_range AS ENUM (
    'UNDER_50K',
    'BETWEEN_50K_100K',
    'BETWEEN_100K_200K',    
    'BETWEEN_200K_500K',
    'OVER_500K'
);

CREATE TYPE risk_tolerance AS ENUM (
    'CONSERVATIVE',
    'MODERATE',
    'AGGRESSIVE'
);

-- ============================================================
-- CLIENTS
-- ============================================================

CREATE TABLE clients (
    client_id                UUID PRIMARY KEY,
    first_name               VARCHAR(50) NOT NULL,
    middle_name              VARCHAR(50),
    last_name                VARCHAR(50) NOT NULL,
    email                    VARCHAR(255) NOT NULL UNIQUE,
    password_hash            VARCHAR(255) NOT NULL,
    date_of_birth            DATE NOT NULL,
    join_date                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    ssn_last4                CHAR(4), -- can be hashed but full for compliance
    portfolio_size_range     portfolio_size_range,
    risk_tolerance           risk_tolerance,
    refresh_token            VARCHAR(500),
    CONSTRAINT chk_clients_ssn_last4
        CHECK (ssn_last4 IS NULL OR ssn_last4 ~ '^[0-9]{4}$')
);

-- ============================================================
-- ADMIN (internal staff only — admins and analysts, never clients)
-- ============================================================

CREATE TABLE admin (
    admin_id        UUID PRIMARY KEY,
    first_name      VARCHAR(50) NOT NULL,
    last_name       VARCHAR(50) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            admin_role NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
);

-- ============================================================
-- ACCOUNTS
-- ============================================================

CREATE TABLE accounts (
    account_id      UUID PRIMARY KEY,
    client_id       UUID NOT NULL,
    name            VARCHAR(255) NOT NULL,
    cash_balance    NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (cash_balance >= 0),
    status          account_status NOT NULL DEFAULT 'ACTIVE',
    open_date       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    CONSTRAINT fk_accounts_client
        FOREIGN KEY (client_id)
        REFERENCES clients (client_id)
        ON DELETE CASCADE
);

-- ============================================================
-- INSTRUMENTS (with current market pricing)
-- ============================================================

CREATE TABLE instruments (
    instrument_id   UUID PRIMARY KEY,
    ticker          VARCHAR(10) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    asset_class     asset_class NOT NULL,
    industry        VARCHAR(100),
    bid              NUMERIC(18,4) CHECK (bid > 0),
    ask              NUMERIC(18,4) CHECK (ask > 0),
    mid_price        NUMERIC(18,4) GENERATED ALWAYS AS ((bid + ask) / 2) STORED,
    price_updated_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- WATCHLISTS
-- ============================================================

CREATE TABLE watchlists (
    watchlist_id    UUID PRIMARY KEY,
    client_id       UUID NOT NULL,
    instrument_id   UUID NOT NULL,
    added_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_watchlists_client
        FOREIGN KEY (client_id)
        REFERENCES clients (client_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_watchlists_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments (instrument_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_watchlists_client_instrument
        UNIQUE (client_id, instrument_id)
);

-- ============================================================
-- INSTRUMENT PRICE HISTORY (daily OHLCV bars from Alpaca)
-- ============================================================

CREATE TABLE instrument_price_history (
    price_history_id UUID PRIMARY KEY,
    instrument_id    UUID NOT NULL,
    timestamp        TIMESTAMP WITH TIME ZONE NOT NULL,
    open             NUMERIC(18,4) NOT NULL CHECK (open > 0),
    high             NUMERIC(18,4) NOT NULL CHECK (high > 0),
    low              NUMERIC(18,4) NOT NULL CHECK (low > 0),
    close            NUMERIC(18,4) NOT NULL CHECK (close > 0),
    volume           INTEGER NOT NULL CHECK (volume >= 0),
    CONSTRAINT fk_price_history_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments (instrument_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_instrument_timestamp
        UNIQUE (instrument_id, timestamp)
);

-- ============================================================
-- ORDERS (buy/sell orders in any status; always LIMIT for now)
-- ============================================================

CREATE TABLE orders (
    order_id        UUID PRIMARY KEY,
    account_id      UUID NOT NULL,
    instrument_id   UUID NOT NULL,
    order_type      order_type NOT NULL,
    quantity        NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    limit_price     NUMERIC(18,4) CHECK (limit_price > 0),
    filled_price    NUMERIC(18,4) CHECK (filled_price > 0),
    status          order_status NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    filled_at       TIMESTAMP WITH TIME ZONE,
    cancelled_at    TIMESTAMP WITH TIME ZONE,
    cancel_reason   TEXT,
    CONSTRAINT fk_orders_account
        FOREIGN KEY (account_id)
        REFERENCES accounts (account_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_orders_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments (instrument_id)
);

-- ============================================================
-- HOLDINGS (accounts' current positions)
-- ============================================================

CREATE TABLE holdings (
    holding_id              UUID PRIMARY KEY,
    account_id              UUID NOT NULL,
    instrument_id           UUID NOT NULL,
    quantity                NUMERIC(18,6) NOT NULL CHECK (quantity >= 0),
    average_cost_basis      NUMERIC(18,4) NOT NULL CHECK (average_cost_basis >= 0),
    CONSTRAINT fk_holdings_account
        FOREIGN KEY (account_id)
        REFERENCES accounts (account_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_holdings_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES instruments (instrument_id),
    CONSTRAINT uq_account_instrument
        UNIQUE (account_id, instrument_id)
);

-- ============================================================
-- TRANSACTIONS (cash movements only — deposits/withdrawals)
-- ============================================================

CREATE TABLE transactions (
    transaction_id      UUID PRIMARY KEY,
    account_id          UUID NOT NULL,
    txn_type                transaction_type NOT NULL,
    amount              NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    CONSTRAINT fk_transactions_account
        FOREIGN KEY (account_id)
        REFERENCES accounts (account_id)
        ON DELETE CASCADE
);

-- ============================================================
-- AUDIT_LOGS (compliance trail for order lifecycle events)
-- ============================================================

CREATE TABLE audit_logs (
    audit_log_id    UUID PRIMARY KEY,
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    order_id        UUID NOT NULL,
    event_type      VARCHAR(20) NOT NULL,
    event_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    reason          TEXT,
    details         JSONB,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_client
        FOREIGN KEY (client_id)
        REFERENCES clients (client_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_audit_logs_account
        FOREIGN KEY (account_id)
        REFERENCES accounts (account_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_audit_logs_order
        FOREIGN KEY (order_id)
        REFERENCES orders (order_id)
        ON DELETE CASCADE
);

-- ============================================================
-- HISTORICAL_SNAPSHOT (EOD job: one row per account per date)
-- ============================================================

CREATE TABLE historical_snapshot (
    snapshot_id     UUID PRIMARY KEY,
    account_id      UUID NOT NULL,
    snapshot_date   DATE NOT NULL,
    cash_balance    NUMERIC(18,2) NOT NULL,
    holdings_value  NUMERIC(18,2) NOT NULL,
    total_value     NUMERIC(18,2) NOT NULL,
    CONSTRAINT fk_historical_snapshot_account
        FOREIGN KEY (account_id)
        REFERENCES accounts (account_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_account_snapshot_date
        UNIQUE (account_id, snapshot_date)
);

-- ============================================================
-- INDEXES (foreign keys + hot query paths)
-- ============================================================

CREATE INDEX idx_accounts_client ON accounts (client_id);

CREATE INDEX idx_orders_account ON orders (account_id);
CREATE INDEX idx_orders_instrument ON orders (instrument_id);
-- Composite index for the dynamic reserved-funds check: open orders per account.
CREATE INDEX idx_orders_account_status ON orders (account_id, status);
-- Supports EOD/matching jobs scanning all open orders system-wide.
CREATE INDEX idx_orders_status ON orders (status);

CREATE INDEX idx_audit_logs_account ON audit_logs (account_id);
CREATE INDEX idx_audit_logs_order ON audit_logs (order_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs (event_type);
CREATE INDEX idx_audit_logs_account_event_time ON audit_logs (account_id, event_time DESC);
CREATE INDEX idx_audit_logs_client_event_time ON audit_logs (client_id, event_time DESC);

CREATE INDEX idx_holdings_instrument ON holdings (instrument_id);

CREATE INDEX idx_watchlists_client ON watchlists (client_id);

CREATE INDEX idx_transactions_account_created ON transactions (account_id, created_at);

CREATE INDEX idx_price_history_instrument_timestamp 
    ON instrument_price_history (instrument_id, timestamp DESC);
