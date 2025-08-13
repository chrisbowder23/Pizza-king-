
async function fetchMenu() {
  const res = await fetch('/api/menu');
  const data = await res.json();
  return data.items;
}

function renderMenu(list, addToCart) {
  const el = document.getElementById('menu-list');
  el.innerHTML = '';
  list.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="name">${item.name}</div>
      <div class="desc">${item.description || ''}</div>
      <div class="actions">
        <div class="price">$${(item.price_cents/100).toFixed(2)}</div>
        <div>
          <input type="number" min="1" value="1" style="width:70px" />
          <button class="btn">Add</button>
        </div>
      </div>
    `;
    const qtyInput = card.querySelector('input');
    card.querySelector('button').addEventListener('click', () => {
      const qty = parseInt(qtyInput.value || '1', 10);
      addToCart({ id: item.id, name: item.name, qty });
    });
    el.appendChild(card);
  });
}

const CART_KEY = 'pkc_cart';

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

function renderCart(cart) {
  const el = document.getElementById('cart');
  if (!el) return;
  if (cart.length === 0) { el.innerHTML = '<p>Your cart is empty.</p>'; return; }
  const list = document.createElement('ul');
  list.style.listStyle = 'none';
  list.style.padding = '0';
  let totalQty = 0;
  cart.forEach((i, idx) => {
    totalQty += i.qty;
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.marginBottom = '.5rem';
    li.innerHTML = `<span>${i.qty}× ${i.name}</span> <button data-idx="${idx}">Remove</button>`;
    list.appendChild(li);
  });
  el.innerHTML = '';
  el.appendChild(list);
  el.insertAdjacentHTML('beforeend', `<p><strong>Items:</strong> ${totalQty}</p>`);
  el.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      cart.splice(idx, 1);
      saveCart(cart);
      renderCart(cart);
    });
  });
}

async function main() {
  if (document.getElementById('menu-list')) {
    const menu = await fetchMenu();
    let cart = loadCart();
    const addToCart = (item) => {
      cart.push(item);
      saveCart(cart);
      renderCart(cart);
    };
    renderMenu(menu, addToCart);
    renderCart(cart);

    const form = document.getElementById('checkout-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const customer_name = fd.get('customer_name');
      const phone = fd.get('phone');
      cart = loadCart();
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name, phone, cart })
      });
      const out = document.getElementById('order-result');
      if (res.ok) {
        const data = await res.json();
        out.innerHTML = `<p>Thanks! Order #<strong>${data.order_id}</strong> placed. Total $${(data.total_cents/100).toFixed(2)}. We'll call you when it's ready.</p>`;
        localStorage.removeItem(CART_KEY);
        renderCart([]);
        form.reset();
      } else {
        const err = await res.json().catch(()=>({error:'Unknown error'}));
        out.innerHTML = `<p style="color:crimson">Error: ${err.error || 'Try again.'}</p>`;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', main);
