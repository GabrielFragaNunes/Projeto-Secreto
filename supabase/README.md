# Banco de dados Supabase

A migration inicial cria as tabelas de políticas e posições por usuário, os dados compartilhados de relatórios de FIIs e Focus, e a trilha de auditoria das simulações de aportes. O Row Level Security (RLS) fica habilitado em todas as tabelas.

## Aplicar a migration

Instale a [Supabase CLI](https://supabase.com/docs/guides/cli) e autentique-se nela. Para um projeto local:

```powershell
supabase start
supabase db reset
```

`db reset` aplica as migrations locais ao banco de desenvolvimento. Para um projeto hospedado, associe o repositório ao projeto e envie as migrations:

```powershell
supabase link --project-ref <PROJECT_REF>
supabase db push
```

Revise o projeto e confirme que o destino está correto antes de aplicar migrations remotas. Não inclua chaves ou credenciais no repositório.

## Verificar o RLS

Use um usuário de teste já criado no Auth local e abra uma conexão SQL com o banco local. Dentro de uma transação, defina o papel `authenticated` e o UUID desse usuário como claim da requisição:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<UUID_DO_USUARIO_TESTE>', true);

SELECT user_id, ticker
FROM public.user_positions;

ROLLBACK;
```

O `SELECT` deve retornar somente posições do UUID autenticado. Repita com outro usuário e confirme que as linhas do primeiro não aparecem. Teste também uma inserção com o UUID autenticado e uma tentativa com outro `user_id`; a segunda deve ser recusada pelo RLS.

Para `facts_fii_reports` e `macro_focus_series`, `authenticated` pode consultar os dados compartilhados, mas não pode alterá-los. A escrita dessas tabelas é concedida somente ao papel `service_role`. `audit_aporte_simulations` permite leitura e inserção do próprio usuário; alterações e remoções são bloqueadas por privilégios, ausência de políticas e trigger de imutabilidade.

> `service_role` ignora políticas RLS por desenho do Supabase. Mantenha sua chave exclusivamente no backend e nunca a exponha ao navegador.
