import { useState, useCallback, useMemo } from 'react';
import BeninCurrencyService, { PriceDisplayOptions, RoundingOption } from '../services/currency/BeninCurrencyService';

interface CurrencyState {
  selectedRounding: 'none' | 'nearest_5' | 'nearest_10' | 'nearest_25';
  showRoundingSuggestions: boolean;
}

interface CurrencyActions {
  formatPrice: (amount: number, options?: Partial<PriceDisplayOptions>) => string;
  parsePrice: (priceString: string) => number;
  validateAmount: (amount: number) => { isValid: boolean; errors: string[]; warnings: string[] };
  getRoundingOptions: (amount: number) => RoundingOption[];
  calculateRoundingImpact: (originalPrice: number, roundedPrice: number, costPrice: number) => any;
  applyRounding: (amount: number, strategy?: CurrencyState['selectedRounding']) => number;
  getSuggestedPrices: (basePrice: number) => number[];
  isMobileMoneyCompatible: (amount: number) => boolean;
  setRoundingPreference: (strategy: CurrencyState['selectedRounding']) => void;
  toggleRoundingSuggestions: () => void;
}

export function useBeninCurrency(): CurrencyState & CurrencyActions {
  const [selectedRounding, setSelectedRounding] = useState<CurrencyState['selectedRounding']>('none');
  const [showRoundingSuggestions, setShowRoundingSuggestions] = useState(true);

  const formatPrice = useCallback((
    amount: number,
    options: Partial<PriceDisplayOptions> = {}
  ): string => {
    const defaultOptions: PriceDisplayOptions = {
      showSymbol: true,
      useThousandsSeparator: true,
      roundingStrategy: selectedRounding,
      showRoundingSuggestion: showRoundingSuggestions
    };

    return BeninCurrencyService.formatPrice(amount, { ...defaultOptions, ...options });
  }, [selectedRounding, showRoundingSuggestions]);

  const parsePrice = useCallback((priceString: string): number => {
    return BeninCurrencyService.parsePrice(priceString);
  }, []);

  const validateAmount = useCallback((amount: number) => {
    return BeninCurrencyService.validateAmount(amount);
  }, []);

  const getRoundingOptions = useCallback((amount: number): RoundingOption[] => {
    return BeninCurrencyService.getRoundingOptions(amount);
  }, []);

  const calculateRoundingImpact = useCallback((
    originalPrice: number,
    roundedPrice: number,
    costPrice: number
  ) => {
    return BeninCurrencyService.calculateRoundingImpact(originalPrice, roundedPrice, costPrice);
  }, []);

  const applyRounding = useCallback((
    amount: number,
    strategy: CurrencyState['selectedRounding'] = selectedRounding
  ): number => {
    const exactAmount = Math.round(amount);

    switch (strategy) {
      case 'nearest_5':
        return Math.round(exactAmount / 5) * 5;
      case 'nearest_10':
        return Math.round(exactAmount / 10) * 10;
      case 'nearest_25':
        return Math.round(exactAmount / 25) * 25;
      case 'none':
      default:
        return exactAmount;
    }
  }, [selectedRounding]);

  const getSuggestedPrices = useCallback((basePrice: number): number[] => {
    return BeninCurrencyService.getSuggestedPrices(basePrice);
  }, []);

  const isMobileMoneyCompatible = useCallback((amount: number): boolean => {
    return BeninCurrencyService.isMobileMoneyCompatible(amount);
  }, []);

  const setRoundingPreference = useCallback((strategy: CurrencyState['selectedRounding']) => {
    setSelectedRounding(strategy);
  }, []);

  const toggleRoundingSuggestions = useCallback(() => {
    setShowRoundingSuggestions(prev => !prev);
  }, []);

  const currencyConfig = useMemo(() => {
    return BeninCurrencyService.getDefaultConfig();
  }, []);

  return {
    selectedRounding,
    showRoundingSuggestions,
    formatPrice,
    parsePrice,
    validateAmount,
    getRoundingOptions,
    calculateRoundingImpact,
    applyRounding,
    getSuggestedPrices,
    isMobileMoneyCompatible,
    setRoundingPreference,
    toggleRoundingSuggestions
  };
}

export function useCurrencyFormatter() {
  const { formatPrice } = useBeninCurrency();

  const formatter = useCallback((amount: number) => {
    return formatPrice(amount, { showSymbol: true, useThousandsSeparator: true });
  }, [formatPrice]);

  return { formatPrice: formatter };
}

export function usePriceInput() {
  const { parsePrice, validateAmount, formatPrice } = useBeninCurrency();
  const [inputValue, setInputValue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);

    const numericValue = parsePrice(value);
    const validation = validateAmount(numericValue);

    setErrors(validation.errors);
    setWarnings(validation.warnings);
  }, [parsePrice, validateAmount]);

  const getFormattedValue = useCallback(() => {
    const numericValue = parsePrice(inputValue);
    return formatPrice(numericValue);
  }, [parsePrice, formatPrice, inputValue]);

  const getNumericValue = useCallback(() => {
    return parsePrice(inputValue);
  }, [parsePrice, inputValue]);

  const isValid = useMemo(() => {
    return errors.length === 0;
  }, [errors]);

  return {
    inputValue,
    errors,
    warnings,
    isValid,
    handleInputChange,
    getFormattedValue,
    getNumericValue,
    setInputValue
  };
}