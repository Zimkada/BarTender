// utils/validation.ts - Validation utilities (backend-ready)
// Ces fonctions peuvent être réutilisées côté serveur pour valider les données

export type ValidationResult = {
  isValid: boolean;
  errors: Record<string, string>;
};

/**
 * Valide un objet utilisateur
 */
export function validateUser(data: {
  username?: string;
  password?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Username
  if (data.username !== undefined) {
    if (!data.username || data.username.length < 3) {
      errors.username = "Le nom d'utilisateur doit contenir au moins 3 caractères";
    } else if (data.username.length > 20) {
      errors.username = "Le nom d'utilisateur ne peut pas dépasser 20 caractères";
    } else if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
      errors.username = "Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscores";
    }
  }

  // Password
  if (data.password !== undefined) {
    if (!data.password || data.password.length < 4) {
      errors.password = 'Le mot de passe doit contenir au moins 4 caractères';
    } else if (data.password.length > 100) {
      errors.password = 'Le mot de passe ne peut pas dépasser 100 caractères';
    }
  }

  // Name
  if (data.name !== undefined) {
    if (!data.name || data.name.trim().length < 2) {
      errors.name = 'Le nom doit contenir au moins 2 caractères';
    } else if (data.name.length > 100) {
      errors.name = 'Le nom ne peut pas dépasser 100 caractères';
    }
  }

  // Email (optional but if provided must be valid)
  if (data.email !== undefined && data.email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = 'Email invalide';
    }
  }

  // Phone (Benin format: 10 digits starting with 01, 02, etc.)
  if (data.phone !== undefined) {
    const cleanPhone = data.phone.replace(/\s/g, '');
    if (!cleanPhone) {
      errors.phone = 'Le numéro de téléphone est requis';
    } else if (!/^[0-9]{10}$/.test(cleanPhone)) {
      errors.phone = 'Le téléphone doit contenir exactement 10 chiffres';
    } else if (!cleanPhone.startsWith('0')) {
      errors.phone = 'Le téléphone doit commencer par 0';
    }
  }

  // Role
  if (data.role !== undefined) {
    const validRoles = ['super_admin', 'promoteur', 'gerant', 'serveur'];
    if (!validRoles.includes(data.role)) {
      errors.role = 'Rôle invalide';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valide un objet bar
 */
export function validateBar(data: {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Name
  if (data.name !== undefined) {
    if (!data.name || data.name.trim().length < 2) {
      errors.name = 'Le nom du bar doit contenir au moins 2 caractères';
    } else if (data.name.length > 100) {
      errors.name = 'Le nom du bar ne peut pas dépasser 100 caractères';
    }
  }

  // Address (optional)
  if (data.address !== undefined && data.address.trim()) {
    if (data.address.length > 500) {
      errors.address = "L'adresse ne peut pas dépasser 500 caractères";
    }
  }

  // Phone (optional but if provided must be valid)
  if (data.phone !== undefined && data.phone.trim()) {
    const cleanPhone = data.phone.replace(/\s/g, '');
    if (!/^[0-9]{10}$/.test(cleanPhone)) {
      errors.phone = 'Le téléphone doit contenir exactement 10 chiffres';
    }
  }

  // Email (optional but if provided must be valid)
  if (data.email !== undefined && data.email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = 'Email invalide';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valide un objet produit
 */
export function validateProduct(data: {
  name?: string;
  category?: string;
  price?: number;
  stock?: number;
  minStock?: number;
  unit?: string;
  consignable?: boolean;
  consignAmount?: number;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Name
  if (data.name !== undefined) {
    if (!data.name || data.name.trim().length < 2) {
      errors.name = 'Le nom du produit doit contenir au moins 2 caractères';
    } else if (data.name.length > 100) {
      errors.name = 'Le nom du produit ne peut pas dépasser 100 caractères';
    }
  }

  // Category
  if (data.category !== undefined) {
    if (!data.category || data.category.trim().length < 2) {
      errors.category = 'La catégorie doit contenir au moins 2 caractères';
    }
  }

  // Price
  if (data.price !== undefined) {
    if (typeof data.price !== 'number' || data.price <= 0) {
      errors.price = 'Le prix doit être un nombre positif';
    }
  }

  // Stock
  if (data.stock !== undefined) {
    if (typeof data.stock !== 'number' || data.stock < 0) {
      errors.stock = 'Le stock doit être un nombre positif ou zéro';
    }
  }

  // Min Stock
  if (data.minStock !== undefined) {
    if (typeof data.minStock !== 'number' || data.minStock < 0) {
      errors.minStock = 'Le stock minimum doit être un nombre positif ou zéro';
    }
  }

  // Unit
  if (data.unit !== undefined) {
    if (!data.unit || data.unit.trim().length === 0) {
      errors.unit = "L'unité est requise";
    }
  }

  // Consign Amount
  if (data.consignable && data.consignAmount !== undefined) {
    if (typeof data.consignAmount !== 'number' || data.consignAmount < 0) {
      errors.consignAmount = 'Le montant de consignation doit être un nombre positif ou zéro';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valide une vente
 */
export function validateSale(data: {
  items?: Array<{ productId: string; quantity: number }>;
  serverId?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Items
  if (data.items !== undefined) {
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errors.items = 'La vente doit contenir au moins un produit';
    } else {
      data.items.forEach((item, index) => {
        if (!item.productId) {
          errors[`items.${index}.productId`] = 'ID produit requis';
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          errors[`items.${index}.quantity`] = 'La quantité doit être un nombre positif';
        }
      });
    }
  }

  // Server ID
  if (data.serverId !== undefined) {
    if (!data.serverId) {
      errors.serverId = 'ID serveur requis';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valide une consignation
 */
export function validateConsignment(data: {
  clientName?: string;
  clientPhone?: string;
  items?: Array<{ productId: string; quantity: number }>;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Client Name
  if (data.clientName !== undefined) {
    if (!data.clientName || data.clientName.trim().length < 2) {
      errors.clientName = 'Le nom du client doit contenir au moins 2 caractères';
    }
  }

  // Client Phone
  if (data.clientPhone !== undefined) {
    const cleanPhone = data.clientPhone.replace(/\s/g, '');
    if (!cleanPhone) {
      errors.clientPhone = 'Le numéro de téléphone du client est requis';
    } else if (!/^[0-9]{10}$/.test(cleanPhone)) {
      errors.clientPhone = 'Le téléphone doit contenir exactement 10 chiffres';
    }
  }

  // Items
  if (data.items !== undefined) {
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errors.items = 'La consignation doit contenir au moins un produit';
    } else {
      data.items.forEach((item, index) => {
        if (!item.productId) {
          errors[`items.${index}.productId`] = 'ID produit requis';
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          errors[`items.${index}.quantity`] = 'La quantité doit être un nombre positif';
        }
      });
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valide une date range
 */
export function validateDateRange(startDate?: string, endDate?: string): ValidationResult {
  const errors: Record<string, string> = {};

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      errors.startDate = 'Date de début invalide';
    }

    if (isNaN(end.getTime())) {
      errors.endDate = 'Date de fin invalide';
    }

    if (start > end) {
      errors.dateRange = 'La date de début doit être antérieure à la date de fin';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Nettoie un numéro de téléphone (enlève les espaces)
 */
export function sanitizePhone(phone: string): string {
  return phone.replace(/\s/g, '');
}

/**
 * Formate un prix en FCFA
 */
export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

/**
 * Parse un prix FCFA en nombre
 */
export function parseCurrency(formatted: string): number {
  return parseInt(formatted.replace(/[^0-9]/g, ''), 10) || 0;
}

/**
 * Valide une pagination
 */
export function validatePagination(page?: number, limit?: number): ValidationResult {
  const errors: Record<string, string> = {};

  if (page !== undefined) {
    if (typeof page !== 'number' || page < 1) {
      errors.page = 'La page doit être un nombre supérieur ou égal à 1';
    }
  }

  if (limit !== undefined) {
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      errors.limit = 'La limite doit être un nombre entre 1 et 100';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valide une recherche (min 2 caractères)
 */
export function validateSearch(query?: string): ValidationResult {
  const errors: Record<string, string> = {};

  if (query !== undefined && query.trim()) {
    if (query.trim().length < 2) {
      errors.search = 'La recherche doit contenir au moins 2 caractères';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Génère un mot de passe sécurisé
 */
export function generateSecurePassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  let password = '';

  // Garantir au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
  password += '0123456789'[Math.floor(Math.random() * 10)];
  password += '!@#$%&*'[Math.floor(Math.random() * 7)];

  // Compléter le reste
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Mélanger
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Génère un username à partir d'un email
 */
export function generateUsernameFromEmail(email: string): string {
  return email.split('@')[0].toLowerCase();
}

/**
 * Vérifie si une valeur est un UUID valide
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Génère un ID unique (compatible UUID v4)
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
