---
applyTo: "services/engine-py/**"
---

# Instruções para o engine Python

- Use `Decimal` em todos os cálculos de moeda e quantidade. O uso de `float` nesses domínios é proibido; escolha e aplique arredondamento determinístico.
- Mantenha `app/domain/` puro: sem I/O, rede, sistema de arquivos, banco de dados ou dependências de infraestrutura.
- Modele e valide contratos com tipagem estrita do Pydantic v2; evite coerções implícitas e campos sem tipo definido.
- Toda regra de domínio ou cálculo exige testes unitários com `pytest`, incluindo casos de borda e precisão decimal.
