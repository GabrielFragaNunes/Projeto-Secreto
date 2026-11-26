1. Arquitetura Híbrida (Zero Matemática em LLM):
   - Todo cálculo financeiro (preço médio, metas, cotas inteiras, aproveitamento de troco, frações 0.01 de Tesouro Direto, número mágico Snowball e prejuízo compensável de IR) deve ficar em Python (`services/engine-py`) usando arredondamento determinístico testável.
   - A Gemini API (`google-genai`) só pode extrair indicadores objetivos de PDFs públicos (Fundos.NET/CVM) em JSON estruturado com `pagina_fonte`, ou traduzir o impacto do Boletim Focus sobre resultados já calculados.
   - O semáforo de risco (`VERDE`, `AMARELO`, `VERMELHO`) é calculado exclusivamente em Python cruzando os dados extraídos com os limites configurados pelo usuário.

2. Blindagem Regulatória (CVM 19/20):
   - Proibido usar na UI, em mensagens ou em prompts termos prescritivos: "compre", "venda", "recomendamos", "sugerimos", "oportunidade", "barato" ou "carteira recomendada".
   - Usar apenas linguagem matemática e descritiva: "resultado do cálculo de rebalanceamento conforme suas metas", "ativo elegível pelas suas regras", "gatilho configurado acionado (p. X)".
   - Nunca criar alocações-alvo padrão ocultas sem confirmação/edição explícita do usuário.

3. Organização e Qualidade:
   - `apps/web`: Next.js 16 (App Router), React 19, TypeScript estrito, Tailwind CSS.
   - `services/engine-py`: Python 3.12, FastAPI, Pydantic v2, Pandas, Pytest.
   - `packages/contracts`: JSON Schemas canônicos compartilhados.
   - Toda regra financeira em `services/engine-py` exige testes unitários em `pytest`.
   - Validar `apps/web` com `npm run lint` e `npm run build` antes de encerrar qualquer tarefa.

Ao terminar, mostre o arquivo criado para eu revisar e fazer commit.