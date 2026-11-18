export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const parseCurrencyInput = (value: string) => {
  return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
};
