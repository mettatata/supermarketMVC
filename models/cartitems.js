const db = require('../db');

const cartitems = {
    // Return cart rows with productId alias and price/total
    getByUserId: async (userId) => {
        const sql = 'SELECT id, userid, productid AS productId, quantity, price, total FROM cart_items WHERE userid = ?';
        const [rows] = await db.query(sql, [userId]);
        return rows;
    },

    // Get a single cart item for a user and product
    getItem: async (userId, productId) => {
        const sql = 'SELECT id, userid, productid AS productId, quantity, price, total FROM cart_items WHERE userid = ? AND productid = ? LIMIT 1';
        const [rows] = await db.query(sql, [userId, productId]);
        return rows && rows.length ? rows[0] : null;
    },

    // Add quantity (or insert). Accept `price` per unit so we can compute `total`.
    add: async (userId, productId, quantity, price) => {
        const qty = Number(quantity || 0);
        const unitPrice = Number(price || 0);
        const selectSql = 'SELECT id, quantity FROM cart_items WHERE userid = ? AND productid = ?';
        const [rows] = await db.query(selectSql, [userId, productId]);
        
        if (rows && rows.length) {
            const existing = rows[0];
            const newQty = Number(existing.quantity || 0) + qty;
            const newTotal = newQty * unitPrice;
            return await db.query('UPDATE cart_items SET quantity = ?, price = ?, total = ? WHERE id = ?', [newQty, unitPrice, newTotal, existing.id]);
        } else {
            const total = qty * unitPrice;
            return await db.query('INSERT INTO cart_items (userid, productid, quantity, price, total) VALUES (?, ?, ?, ?, ?)', [userId, productId, qty, unitPrice, total]);
        }
    },

    // Remove the row entirely
    remove: async (userId, productId) => {
        return await db.query('DELETE FROM cart_items WHERE userid = ? AND productid = ?', [userId, productId]);
    },

    // Remove multiple productids for a user
    removeBulk: async (userId, productIds) => {
        if (!productIds || !productIds.length) return null;
        const placeholders = productIds.map(() => '?').join(',');
        const sql = `DELETE FROM cart_items WHERE userid = ? AND productid IN (${placeholders})`;
        return await db.query(sql, [userId, ...productIds]);
    },

    // Decrement quantity by `amount`. Update total accordingly and remove row if quantity <= 0.
    decrement: async (userId, productId, amount) => {
        const amt = Number(amount || 1);
        const upd = 'UPDATE cart_items SET quantity = GREATEST(quantity - ?, 0), total = GREATEST(quantity - ?, 0) * price WHERE userid = ? AND productid = ?';
        await db.query(upd, [amt, amt, userId, productId]);
        const del = 'DELETE FROM cart_items WHERE userid = ? AND productid = ? AND quantity <= 0';
        return await db.query(del, [userId, productId]);
    },

    // Update quantity explicitly (and total). If newQty <= 0, the row will be deleted.
    updateQuantity: async (userId, productId, newQty, unitPrice) => {
        const qty = Number(newQty || 0);
        const price = Number(unitPrice || 0);
        if (qty <= 0) {
            return await cartitems.remove(userId, productId);
        }
        const total = qty * price;
        const sql = 'UPDATE cart_items SET quantity = ?, price = ?, total = ? WHERE userid = ? AND productid = ?';
        return await db.query(sql, [qty, price, total, userId, productId]);
    },

    // Clear user's cart
    clear: async (userId) => {
        return await db.query('DELETE FROM cart_items WHERE userid = ?', [userId]);
    }
};

module.exports = cartitems;