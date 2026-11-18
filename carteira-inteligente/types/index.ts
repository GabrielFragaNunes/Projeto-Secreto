export interface PortfolioItem {
  id: string;
  ticker: string;
  price: number;
  dividend: number;
  quantity: number;
  category?: string;
  averagePrice?: number;
  currentPatrimony?: number;
  // Campos Calculados (Regra de Negócio)
  magicNumber: number;
  missingShares: number;
  investmentNeeded: number;
  finalPatrimony: number;
  isSelfSustain: boolean;
  monthlyIncome: number;
}
