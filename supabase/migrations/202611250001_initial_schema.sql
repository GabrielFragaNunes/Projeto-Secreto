CREATE TABLE IF NOT EXISTS public.user_portfolio_policies (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    meta_patrimonial_brl numeric(14,2) NOT NULL DEFAULT 1000000.00,
    aporte_mensal_padrao_brl numeric(14,2) NOT NULL DEFAULT 1000.00,
    metas_classe jsonb NOT NULL,
    metas_segmento jsonb NOT NULL,
    gatilhos_semaforo_fii jsonb NOT NULL,
    filtros_quantitativos_acoes jsonb NOT NULL DEFAULT '{}'::jsonb,
    controle_fiscal_ir jsonb NOT NULL DEFAULT '{"prejuizo_compensavel_acoes_swing_brl":0,"prejuizo_compensavel_fiis_brl":0,"prejuizo_compensavel_daytrade_brl":0}'::jsonb,
    terms_version text NOT NULL,
    terms_accepted_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_positions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticker text NOT NULL,
    classe text NOT NULL CHECK (classe IN ('FIIs','Ações','Tesouro','ETF','FIAGRO','Renda Fixa')),
    segmento text NOT NULL DEFAULT 'Outros',
    quantidade numeric(18,6) NOT NULL CHECK (quantidade >= 0),
    preco_medio numeric(14,4) NOT NULL CHECK (preco_medio >= 0),
    preco_atual numeric(14,4) NOT NULL CHECK (preco_atual >= 0),
    habilitado_aporte boolean NOT NULL DEFAULT true,
    preco_teto_manual numeric(14,4) NULL,
    nota_pessoal text NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_positions_ticker UNIQUE (user_id, ticker)
);

CREATE TABLE IF NOT EXISTS public.facts_fii_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker text NOT NULL,
    competencia text NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
    gestora text NOT NULL,
    hash_pdf_sha256 text NOT NULL UNIQUE,
    payload jsonb NOT NULL,
    source_url text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_fii_ticker_competencia UNIQUE (ticker, competencia)
);

CREATE TABLE IF NOT EXISTS public.macro_focus_series (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    data_referencia date NOT NULL,
    indicador text NOT NULL,
    ano_referencia int NOT NULL,
    mediana numeric(10,4) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_macro_focus_point UNIQUE (data_referencia, indicador, ano_referencia)
);

CREATE TABLE IF NOT EXISTS public.audit_aporte_simulations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    aporte_disponivel numeric(14,2) NOT NULL,
    total_alocado numeric(14,2) NOT NULL,
    troco_residual numeric(14,2) NOT NULL,
    policy_snapshot jsonb NOT NULL,
    positions_snapshot jsonb NOT NULL,
    result_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_positions_user_id ON public.user_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_aporte_user_id ON public.audit_aporte_simulations(user_id);
CREATE INDEX IF NOT EXISTS idx_facts_fii_ticker_competencia
    ON public.facts_fii_reports(ticker, competencia DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_portfolio_policies_updated_at ON public.user_portfolio_policies;
CREATE TRIGGER set_user_portfolio_policies_updated_at
    BEFORE UPDATE ON public.user_portfolio_policies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_user_positions_updated_at ON public.user_positions;
CREATE TRIGGER set_user_positions_updated_at
    BEFORE UPDATE ON public.user_positions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_portfolio_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts_fii_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_focus_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_aporte_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_portfolio_policies_select_own
    ON public.user_portfolio_policies FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
CREATE POLICY user_portfolio_policies_insert_own
    ON public.user_portfolio_policies FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_portfolio_policies_update_own
    ON public.user_portfolio_policies FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_portfolio_policies_delete_own
    ON public.user_portfolio_policies FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY user_positions_select_own
    ON public.user_positions FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
CREATE POLICY user_positions_insert_own
    ON public.user_positions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_positions_update_own
    ON public.user_positions FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_positions_delete_own
    ON public.user_positions FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY audit_aporte_select_own
    ON public.audit_aporte_simulations FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
CREATE POLICY audit_aporte_insert_own
    ON public.audit_aporte_simulations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY facts_fii_reports_read_authenticated
    ON public.facts_fii_reports FOR SELECT TO authenticated
    USING (true);
CREATE POLICY facts_fii_reports_service_role
    ON public.facts_fii_reports FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY macro_focus_series_read_authenticated
    ON public.macro_focus_series FOR SELECT TO authenticated
    USING (true);
CREATE POLICY macro_focus_series_service_role
    ON public.macro_focus_series FOR ALL TO service_role
    USING (true) WITH CHECK (true);

REVOKE ALL ON
    public.user_portfolio_policies,
    public.user_positions,
    public.facts_fii_reports,
    public.macro_focus_series,
    public.audit_aporte_simulations
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_portfolio_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_positions TO authenticated;
GRANT SELECT, INSERT ON public.audit_aporte_simulations TO authenticated;
GRANT SELECT ON public.facts_fii_reports, public.macro_focus_series TO authenticated;
GRANT ALL ON public.facts_fii_reports, public.macro_focus_series TO service_role;
