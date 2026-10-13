# Item & Purchase Management System
Node.js + Express + MySQL, with a vanilla HTML/CSS/JS frontend served by Express.

## Prerequisites
Node.js 18+, MySQL 8.0.16+ (CHECK constraints), npm.

## Setup
```bash
npm install
mysql -u root -p < schema.sql        # creates DB item_purchase_db, tables and sample data
cp .env.example .env                 # then edit DB_USER / DB_PASSWORD / DB_NAME
npm start                            # http://localhost:3000 (API + frontend)
```
The frontend is served by the same Express process, so there is no separate frontend command.

## Key design points
- **Transactions**: purchase create/update run in one transaction (lock items `FOR UPDATE`, validate, insert, adjust stock, commit; rollback on any error).
- **Stock**: purchase update applies `delta = newQty - oldQty` per item (3→5 deducts 2, 5→2 returns 3). Stock also has a DB `CHECK (stock_available >= 0)`.
- **Duplicates**: the same item repeated in one order is merged (quantities summed).
- **No purchase delete**: no DELETE route and no UI button. `purchase_items.item_id` is `ON DELETE RESTRICT`.
- **Item delete**: rejected with 409 if the item appears in any purchase; deactivate instead.
- **Order ID**: auto-generated `PO-00001`... (an optional custom `order_id` is accepted).
- **JOINs**: items+item_types (`/api/items`), purchases+purchase_items+items+item_types (`/api/purchases/:id`).

## API
| Method | Route | Notes |
|---|---|---|
| GET/POST | `/api/item-types` | `{type_name}` |
| PUT/DELETE | `/api/item-types/:id` | delete → 409 if in use |
| GET/POST | `/api/items` | `{name,item_type_id,purchase_date,stock_available,active}` |
| GET/PUT/DELETE | `/api/items/:id` | GET includes purchase history |
| GET/POST | `/api/purchases` | POST `{purchase_date, items:[{item_id,quantity}]}` |
| GET/PUT | `/api/purchases/:id` | PUT same body as POST |

Status codes: 400 validation, 404 not found, 409 business conflict (inactive item, insufficient stock, item in history), 500 safe generic error.

```bash
curl -X POST localhost:3000/api/purchases -H 'Content-Type: application/json' \
 -d '{"purchase_date":"2026-08-25","items":[{"item_id":1,"quantity":2},{"item_id":2,"quantity":5}]}'
# Insufficient stock -> 409 {"error":"Insufficient stock for Laptop; available quantity: 8", ...}
```
