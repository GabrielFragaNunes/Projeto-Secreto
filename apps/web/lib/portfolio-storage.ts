import { useSyncExternalStore } from 'react';
import type { PortfolioItem } from '@/types';
import { PORTFOLIO_STORAGE_KEY } from '@/lib/portfolio-storage-key';

const EMPTY_PORTFOLIO: PortfolioItem[] = [];
const subscribers = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedPortfolio = EMPTY_PORTFOLIO;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPortfolioItem(value: unknown): value is PortfolioItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.ticker === 'string'
    && typeof value.price === 'number'
    && Number.isFinite(value.price)
    && typeof value.quantity === 'number'
    && Number.isFinite(value.quantity)
    && typeof value.dividend === 'number'
    && Number.isFinite(value.dividend)
    && typeof value.magicNumber === 'number'
    && typeof value.missingShares === 'number'
    && typeof value.investmentNeeded === 'number'
    && typeof value.finalPatrimony === 'number'
    && typeof value.isSelfSustain === 'boolean'
    && typeof value.monthlyIncome === 'number';
}

function getSnapshot(): PortfolioItem[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
  } catch (error) {
    console.error('Não foi possível ler a carteira salva neste navegador:', error);
    return cachedPortfolio;
  }

  if (raw === cachedRaw) return cachedPortfolio;
  cachedRaw = raw;
  if (raw === null) {
    cachedPortfolio = EMPTY_PORTFOLIO;
    return cachedPortfolio;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isPortfolioItem)) {
      throw new Error('Os dados salvos da carteira têm um formato inválido.');
    }
    cachedPortfolio = parsed;
  } catch (error) {
    console.error('Não foi possível carregar a carteira salva:', error);
    cachedPortfolio = EMPTY_PORTFOLIO;
  }
  return cachedPortfolio;
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === PORTFOLIO_STORAGE_KEY) {
      cachedRaw = undefined;
      callback();
    }
  };
  window.addEventListener('storage', handleStorage);
  return () => {
    subscribers.delete(callback);
    window.removeEventListener('storage', handleStorage);
  };
}

export function useStoredPortfolio(): PortfolioItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_PORTFOLIO);
}

export function updateStoredPortfolio(
  update: (current: PortfolioItem[]) => PortfolioItem[],
): void {
  const next = update(getSnapshot());
  const serialized = JSON.stringify(next);
  try {
    window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, serialized);
  } catch (error) {
    console.error('Não foi possível salvar a carteira neste navegador:', error);
  }
  cachedRaw = serialized;
  cachedPortfolio = next;
  subscribers.forEach((callback) => callback());
}
