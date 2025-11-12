# BarTender Pro - API Endpoints Documentation

Ce document définit tous les endpoints API nécessaires pour migrer vers une architecture backend.

## Architecture

- **Frontend**: React + TypeScript (actuel)
- **Backend prévu**: Node.js/Express ou Python/FastAPI
- **Base de données**: PostgreSQL ou MongoDB
- **Authentification**: JWT tokens

---

## 1. Authentication & Users

### POST `/api/auth/login`
Authentifie un utilisateur et retourne un JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "token": "string",
  "session": {
    "userId": "string",
    "userName": "string",
    "role": "super_admin | promoteur | gerant | serveur",
    "barId": "string | null"
  }
}
```

**Errors:**
- 401: Invalid credentials
- 400: Missing fields

---

### POST `/api/auth/logout`
Déconnecte l'utilisateur (invalide le token).

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

---

### POST `/api/auth/change-password`
Change le mot de passe d'un utilisateur.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "userId": "string",
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

**Errors:**
- 401: Unauthorized
- 400: Invalid current password
- 400: Password validation failed

---

### GET `/api/users`
Liste tous les utilisateurs (super_admin seulement).

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `barId` (optional): Filter by bar
- `role` (optional): Filter by role

**Response (200):**
```json
{
  "users": [
    {
      "id": "string",
      "username": "string",
      "name": "string",
      "email": "string",
      "phone": "string",
      "role": "string",
      "barId": "string | null",
      "isActive": true,
      "createdAt": "ISO8601",
      "lastLogin": "ISO8601"
    }
  ]
}
```

---

### POST `/api/users`
Crée un nouvel utilisateur.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "promoteur | gerant | serveur",
  "barId": "string | null"
}
```

**Response (201):**
```json
{
  "user": { /* user object */ },
  "message": "User created successfully"
}
```

**Validation Rules:**
- `username`: 3-20 chars, alphanumeric + underscore
- `password`: min 6 chars
- `email`: valid email format
- `phone`: 10 digits
- `role`: one of allowed roles

---

### PATCH `/api/users/:userId`
Met à jour un utilisateur.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "isActive": "boolean (optional)"
}
```

**Response (200):**
```json
{
  "user": { /* updated user */ }
}
```

---

### DELETE `/api/users/:userId`
Supprime (désactive) un utilisateur.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "User deleted successfully"
}
```

---

## 2. Bars Management

### GET `/api/bars`
Liste tous les bars.

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `status` (optional): `active | suspended | all`
- `search` (optional): Search by name/address/email

**Response (200):**
```json
{
  "bars": [
    {
      "id": "string",
      "name": "string",
      "address": "string",
      "phone": "string",
      "email": "string",
      "promoterId": "string",
      "isActive": true,
      "createdAt": "ISO8601",
      "settings": {
        "businessDayCloseHour": 6,
        "consignmentExpirationDays": 30,
        "operatingMode": "simplified | advanced"
      }
    }
  ]
}
```

---

### GET `/api/bars/:barId`
Récupère les détails d'un bar.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "bar": { /* bar object */ }
}
```

---

### POST `/api/bars`
Crée un nouveau bar (avec promoteur).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "barName": "string",
  "address": "string",
  "phone": "string",
  "email": "string",
  "promoter": {
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "password": "string"
  }
}
```

**Response (201):**
```json
{
  "bar": { /* bar object */ },
  "promoter": { /* user object */ },
  "credentials": {
    "username": "string",
    "password": "string"
  }
}
```

---

### PATCH `/api/bars/:barId`
Met à jour un bar.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "string (optional)",
  "address": "string (optional)",
  "phone": "string (optional)",
  "email": "string (optional)",
  "settings": { /* settings object (optional) */ }
}
```

**Response (200):**
```json
{
  "bar": { /* updated bar */ }
}
```

---

### POST `/api/bars/:barId/suspend`
Suspend un bar (super_admin seulement).

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Bar suspended successfully"
}
```

---

### POST `/api/bars/:barId/activate`
Active un bar suspendu (super_admin seulement).

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Bar activated successfully"
}
```

---

## 3. Products & Inventory

### GET `/api/bars/:barId/products`
Liste tous les produits d'un bar.

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `category` (optional): Filter by category
- `search` (optional): Search by name

**Response (200):**
```json
{
  "products": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "price": 1500,
      "stock": 50,
      "minStock": 10,
      "unit": "unité | litre | bouteille",
      "consignable": false,
      "consignAmount": 0
    }
  ]
}
```

---

### POST `/api/bars/:barId/products`
Ajoute un produit.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "string",
  "category": "string",
  "price": 1500,
  "stock": 50,
  "minStock": 10,
  "unit": "string",
  "consignable": false,
  "consignAmount": 0
}
```

**Response (201):**
```json
{
  "product": { /* product object */ }
}
```

**Validation:**
- `name`: required, min 2 chars
- `price`: positive number
- `stock`: non-negative number
- `consignAmount`: non-negative, required if consignable=true

---

### PATCH `/api/bars/:barId/products/:productId`
Met à jour un produit.

**Headers:** `Authorization: Bearer <token>`

**Request Body:** (partial update)
```json
{
  "price": 2000,
  "stock": 100
}
```

**Response (200):**
```json
{
  "product": { /* updated product */ }
}
```

---

### DELETE `/api/bars/:barId/products/:productId`
Supprime un produit.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Product deleted successfully"
}
```

---

## 4. Sales & Transactions

### GET `/api/bars/:barId/sales`
Liste les ventes d'un bar.

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `startDate` (optional): ISO8601 date
- `endDate` (optional): ISO8601 date
- `serverId` (optional): Filter by server
- `page` (optional): Pagination
- `limit` (optional): Items per page

**Response (200):**
```json
{
  "sales": [
    {
      "id": "string",
      "date": "ISO8601",
      "items": [
        {
          "productId": "string",
          "productName": "string",
          "quantity": 2,
          "price": 1500,
          "total": 3000
        }
      ],
      "totalAmount": 3000,
      "serverId": "string",
      "serverName": "string"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalItems": 250,
    "totalPages": 5
  }
}
```

---

### POST `/api/bars/:barId/sales`
Enregistre une vente.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "items": [
    {
      "productId": "string",
      "quantity": 2
    }
  ],
  "serverId": "string",
  "date": "ISO8601"
}
```

**Response (201):**
```json
{
  "sale": { /* sale object */ },
  "totalAmount": 3000
}
```

**Validation:**
- `items`: non-empty array
- `quantity`: positive number
- Product must exist and have sufficient stock

---

### DELETE `/api/bars/:barId/sales/:saleId`
Annule une vente (remboursement).

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Sale refunded successfully"
}
```

---

## 5. Consignments

### GET `/api/bars/:barId/consignments`
Liste les consignations d'un bar.

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `status` (optional): `active | returned | expired`
- `search` (optional): Search by client name/phone

**Response (200):**
```json
{
  "consignments": [
    {
      "id": "string",
      "clientName": "string",
      "clientPhone": "string",
      "items": [
        {
          "productId": "string",
          "productName": "string",
          "quantity": 5,
          "unitAmount": 500,
          "totalAmount": 2500
        }
      ],
      "totalAmount": 2500,
      "status": "active",
      "createdAt": "ISO8601",
      "expiresAt": "ISO8601"
    }
  ]
}
```

---

### POST `/api/bars/:barId/consignments`
Crée une consignation.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "clientName": "string",
  "clientPhone": "string",
  "items": [
    {
      "productId": "string",
      "quantity": 5
    }
  ]
}
```

**Response (201):**
```json
{
  "consignment": { /* consignment object */ }
}
```

---

### POST `/api/bars/:barId/consignments/:consignmentId/return`
Retourne une consignation.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "returnedItems": [
    {
      "productId": "string",
      "quantity": 5
    }
  ]
}
```

**Response (200):**
```json
{
  "message": "Consignment returned successfully",
  "refundAmount": 2500
}
```

---

## 6. Audit Logs

### GET `/api/audit-logs`
Liste les audit logs (super_admin seulement).

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `startDate` (optional): ISO8601
- `endDate` (optional): ISO8601
- `severity` (optional): `critical | warning | info`
- `event` (optional): Event type
- `userId` (optional): Filter by user
- `barId` (optional): Filter by bar
- `search` (optional): Full-text search
- `page`, `limit`: Pagination

**Response (200):**
```json
{
  "logs": [
    {
      "id": "string",
      "timestamp": "ISO8601",
      "event": "USER_LOGIN",
      "severity": "info",
      "description": "string",
      "userId": "string",
      "userName": "string",
      "userRole": "string",
      "barId": "string | null",
      "barName": "string | null",
      "metadata": {}
    }
  ],
  "pagination": { /* pagination object */ }
}
```

---

### GET `/api/audit-logs/export`
Exporte les audit logs (CSV ou JSON).

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- Same filters as GET `/api/audit-logs`
- `format`: `csv | json`

**Response (200):**
- Content-Type: `text/csv` or `application/json`
- Content-Disposition: `attachment; filename="audit-logs-YYYY-MM-DD.csv"`

---

## 7. Analytics & Reports

### GET `/api/bars/:barId/analytics/sales`
Statistiques de vente.

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `startDate`, `endDate`: Date range
- `groupBy`: `day | week | month`

**Response (200):**
```json
{
  "analytics": {
    "totalSales": 1500000,
    "totalTransactions": 250,
    "averageTransaction": 6000,
    "topProducts": [
      {
        "productId": "string",
        "productName": "string",
        "quantity": 150,
        "revenue": 225000
      }
    ],
    "salesByDay": [
      {
        "date": "2025-01-01",
        "sales": 50000,
        "transactions": 15
      }
    ]
  }
}
```

---

## 8. Notifications

### GET `/api/notifications`
Liste les notifications d'un utilisateur.

**Headers:** `Authorization: Bearer <token>`

**Query Params:**
- `unreadOnly` (optional): boolean
- `limit`, `offset`: Pagination

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "string",
      "type": "low_stock | expiring_consignment | system",
      "title": "string",
      "message": "string",
      "severity": "info | warning | critical",
      "isRead": false,
      "createdAt": "ISO8601",
      "metadata": {}
    }
  ]
}
```

---

### PATCH `/api/notifications/:notificationId/read`
Marque une notification comme lue.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Notification marked as read"
}
```

---

### POST `/api/notifications/mark-all-read`
Marque toutes les notifications comme lues.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "All notifications marked as read"
}
```

---

## Data Validation Rules

### Global Rules
- All dates: ISO8601 format
- All IDs: UUID v4
- Pagination: max 100 items per page
- Search: min 2 characters

### Field-specific Rules
- **Phone**: 10 digits, Benin format (01XXXXXXXX)
- **Email**: RFC 5322 compliant
- **Currency**: XOF (West African CFA franc), stored as integers
- **Timestamps**: UTC timezone

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  }
}
```

---

## Security Notes

1. **Authentication**: JWT tokens with 7-day expiry
2. **Authorization**: Role-based access control (RBAC)
3. **Rate Limiting**: 100 requests/minute per user
4. **Data Isolation**: Multi-tenant with barId filtering
5. **Audit Logging**: All mutations logged automatically
6. **Password Hashing**: bcrypt with salt rounds=12
7. **HTTPS Only**: Force SSL in production
8. **CORS**: Whitelist allowed origins

---

## Database Schema Suggestions

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(20) NOT NULL,
  role VARCHAR(20) NOT NULL,
  bar_id UUID REFERENCES bars(id),
  is_active BOOLEAN DEFAULT true,
  first_login BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_bar_id (bar_id)
);
```

### Bars Table
```sql
CREATE TABLE bars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  promoter_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  settings JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_promoter_id (promoter_id)
);
```

### Products Table
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID REFERENCES bars(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  price INTEGER NOT NULL,
  stock DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_stock DECIMAL(10,2) DEFAULT 0,
  unit VARCHAR(20),
  consignable BOOLEAN DEFAULT false,
  consign_amount INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bar_id (bar_id),
  INDEX idx_category (category)
);
```

### Sales Table
```sql
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id UUID REFERENCES bars(id) NOT NULL,
  server_id UUID REFERENCES users(id) NOT NULL,
  items JSONB NOT NULL,
  total_amount INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bar_id_created (bar_id, created_at),
  INDEX idx_server_id (server_id)
);
```

### Audit Logs Table
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  event VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(100),
  user_role VARCHAR(20),
  bar_id UUID REFERENCES bars(id),
  bar_name VARCHAR(100),
  metadata JSONB,
  INDEX idx_timestamp (timestamp),
  INDEX idx_event (event),
  INDEX idx_severity (severity),
  INDEX idx_user_id (user_id),
  INDEX idx_bar_id (bar_id)
);
```

---

## Migration Strategy

### Phase 1: Preparation (Current)
- ✅ Frontend architecture ready
- ✅ Data models defined
- ✅ Validation rules documented
- ✅ API endpoints specified

### Phase 2: Backend Development
1. Set up Express/FastAPI server
2. Implement authentication middleware
3. Create database schema
4. Implement CRUD endpoints
5. Add audit logging middleware
6. Test with Postman/curl

### Phase 3: Frontend Integration
1. Create API client service
2. Replace localStorage with API calls
3. Implement token management
4. Add loading states and error handling
5. Test offline fallback (optional)

### Phase 4: Deployment
1. Set up PostgreSQL/MongoDB
2. Configure environment variables
3. Deploy backend (Heroku/Railway/Render)
4. Deploy frontend (Vercel/Netlify)
5. Set up monitoring (Sentry, LogRocket)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Ready for backend implementation
