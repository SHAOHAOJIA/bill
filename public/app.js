let token = localStorage.getItem('bill_token');
let currentUser = null;

try {
  const saved = localStorage.getItem('bill_user');
  if (saved) currentUser = JSON.parse(saved);
} catch {}

const form = document.getElementById('billForm');
const tableBody = document.getElementById('billTableBody');
const emptyTip = document.getElementById('emptyTip');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const formTitle = document.getElementById('formTitle');
const loginOverlay = document.getElementById('loginOverlay');
const mainContainer = document.getElementById('mainContainer');
const userInfo = document.getElementById('userInfo');

let editingId = null;
let socket = null;

function formatMoney(n) {
  if (n === null || n === undefined) return '¥0.00';
  return '¥' + parseFloat(n).toFixed(2);
}

function formatNum(n) {
  if (n === null || n === undefined) return '0';
  return parseFloat(n).toLocaleString('zh-CN');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function api(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': 'Bearer ' + (token || '')
    }
  };
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  return fetch(url, opts);
}

function showLogin() {
  loginOverlay.style.display = 'flex';
  mainContainer.style.display = 'none';
}

function showMain() {
  loginOverlay.style.display = 'none';
  mainContainer.style.display = 'block';
  applyRoleUI();
}

function applyRoleUI() {
  const role = currentUser?.role;
  const isWaiter = role === 'waiter';

  // 服务员看不到单价
  const unitPriceField = document.getElementById('unitPriceField');
  const thUnitPrice = document.getElementById('thUnitPrice');
  if (isWaiter) {
    if (unitPriceField) unitPriceField.style.display = 'none';
    if (thUnitPrice) thUnitPrice.style.display = 'none';
  } else {
    if (unitPriceField) unitPriceField.style.display = '';
    if (thUnitPrice) thUnitPrice.style.display = '';
  }

  // 用户信息显示
  const roleText = { admin: '管理员', finance: '财务', waiter: '服务员' };
  userInfo.textContent = `${currentUser?.username}（${roleText[role] || role}）`;
}

async function login(username, password) {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || '登录失败');
      return false;
    }
    token = data.token;
    currentUser = { username: data.username, role: data.role };
    localStorage.setItem('bill_token', token);
    localStorage.setItem('bill_user', JSON.stringify(currentUser));
    showMain();
    initApp();
    return true;
  } catch {
    alert('登录失败，请检查网络');
    return false;
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('bill_token');
  localStorage.removeItem('bill_user');
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  showLogin();
}

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  login(u, p);
});

document.getElementById('logoutBtn').addEventListener('click', logout);

function getFilters() {
  return {
    month: document.getElementById('filterMonth').value,
    company: document.getElementById('filterCompany').value,
    unpaidOnly: document.getElementById('filterUnpaid').checked ? 'true' : ''
  };
}

async function loadData() {
  try {
    const filters = getFilters();
    const params = new URLSearchParams();
    if (filters.month) params.append('month', filters.month);
    if (filters.company) params.append('company', filters.company);
    if (filters.unpaidOnly) params.append('unpaidOnly', filters.unpaidOnly);

    const [billsRes, statsRes, companiesRes] = await Promise.all([
      api(`/api/bills?${params}`),
      api('/api/stats'),
      api('/api/companies')
    ]);

    if (billsRes.status === 401) { logout(); return; }

    const bills = await billsRes.json();
    const stats = await statsRes.json();
    const companies = await companiesRes.json();

    renderStats(stats);
    renderTable(bills);
    updateCompanyFilter(companies);
  } catch (err) {
    console.error('加载失败', err);
  }
}

function renderStats(stats) {
  document.getElementById('statQty').textContent = formatNum(stats.total_qty);
  document.getElementById('statTotal').textContent = formatMoney(stats.total_amount);
  document.getElementById('statPaid').textContent = formatMoney(stats.total_paid);
  document.getElementById('statUnpaid').textContent = formatMoney(stats.total_unpaid);
  document.getElementById('statUnpaidCount').textContent = stats.unpaid_count || 0;
}

function renderTable(bills) {
  tableBody.innerHTML = '';

  if (!bills || bills.length === 0) {
    emptyTip.style.display = 'block';
    return;
  }
  emptyTip.style.display = 'none';

  const isWaiter = currentUser?.role === 'waiter';
  const canEdit = ['finance', 'admin'].includes(currentUser?.role);

  bills.forEach(b => {
    const tr = document.createElement('tr');
    let html = `
      <td>${b.date}</td>
      <td>${escapeHtml(b.company)}</td>
      <td>${formatNum(b.quantity)}</td>
    `;
    if (!isWaiter) {
      html += `<td>${b.unit_price !== undefined ? formatMoney(b.unit_price) : '-'}</td>`;
    }
    html += `
      <td>${formatMoney(b.total_amount)}</td>
      <td>${formatMoney(b.paid)}</td>
      <td class="${b.unpaid > 0 ? 'unpaid' : ''}">${formatMoney(b.unpaid)}</td>
      <td class="note" title="${escapeHtml(b.note)}">${escapeHtml(b.note)}</td>
    `;
    if (canEdit) {
      html += `
        <td>
          <button class="danger" onclick="startEdit(${b.id})">编辑</button>
          <button class="danger" onclick="deleteBill(${b.id})">删除</button>
        </td>
      `;
    } else {
      html += `<td>-</td>`;
    }
    tr.innerHTML = html;
    tableBody.appendChild(tr);
  });
}

function updateCompanyFilter(companies) {
  const select = document.getElementById('filterCompany');
  const currentVal = select.value;
  let html = '<option value="">全部公司</option>';
  companies.forEach(c => {
    html += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  });
  select.innerHTML = html;
  select.value = currentVal;
}

function updatePreview() {
  const isWaiter = currentUser?.role === 'waiter';
  const qty = parseFloat(document.getElementById('quantity').value) || 0;
  const price = isWaiter ? 0 : (parseFloat(document.getElementById('unitPrice').value) || 0);
  const paid = parseFloat(document.getElementById('paid').value) || 0;
  const total = qty * price;
  const unpaid = total - paid;
  document.getElementById('previewTotal').textContent = formatMoney(total);
  document.getElementById('previewUnpaid').textContent = formatMoney(unpaid);
}

function resetForm() {
  form.reset();
  editingId = null;
  document.getElementById('date').valueAsDate = new Date();
  submitBtn.textContent = '添加';
  cancelBtn.style.display = 'none';
  formTitle.textContent = '添加账单';
  updatePreview();
}

async function startEdit(id) {
  try {
    const res = await api('/api/bills');
    if (res.status === 401) { logout(); return; }
    const bills = await res.json();
    const b = bills.find(x => x.id === id);
    if (!b) return;

    document.getElementById('date').value = b.date;
    document.getElementById('company').value = b.company;
    document.getElementById('quantity').value = b.quantity;
    if (!currentUser || currentUser.role !== 'waiter') {
      document.getElementById('unitPrice').value = b.unit_price;
    }
    document.getElementById('paid').value = b.paid;
    document.getElementById('note').value = b.note || '';

    editingId = id;
    submitBtn.textContent = '保存修改';
    cancelBtn.style.display = 'inline-block';
    formTitle.textContent = '编辑账单';
    updatePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error('加载账单失败', err);
  }
}

async function deleteBill(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  try {
    const res = await api(`/api/bills/${id}`, { method: 'DELETE' });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { alert('权限不足'); return; }
    loadData();
  } catch (err) {
    alert('删除失败');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const isWaiter = currentUser?.role === 'waiter';

  const quantity = parseFloat(document.getElementById('quantity').value) || 0;
  const unitPrice = isWaiter ? 0 : (parseFloat(document.getElementById('unitPrice').value) || 0);
  const paid = parseFloat(document.getElementById('paid').value) || 0;
  const total = quantity * unitPrice;
  const unpaid = total - paid;

  const bill = {
    date: document.getElementById('date').value,
    company: document.getElementById('company').value.trim(),
    quantity,
    unit_price: unitPrice,
    total_amount: total,
    paid,
    unpaid,
    note: document.getElementById('note').value.trim()
  };

  try {
    let res;
    if (editingId) {
      res = await api(`/api/bills/${editingId}`, {
        method: 'PUT',
        body: bill
      });
    } else {
      res = await api('/api/bills', {
        method: 'POST',
        body: bill
      });
    }
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { alert('权限不足或保存失败'); return; }
    resetForm();
    loadData();
  } catch (err) {
    alert('保存失败');
  }
});

cancelBtn.addEventListener('click', resetForm);

['quantity', 'unitPrice', 'paid'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updatePreview);
});

document.getElementById('filterMonth').addEventListener('change', loadData);
document.getElementById('filterCompany').addEventListener('change', loadData);
document.getElementById('filterUnpaid').addEventListener('change', loadData);

document.getElementById('resetFilter').addEventListener('click', () => {
  document.getElementById('filterMonth').value = '';
  document.getElementById('filterCompany').value = '';
  document.getElementById('filterUnpaid').checked = false;
  loadData();
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    const res = await api('/api/bills');
    if (res.status === 401) { logout(); return; }
    const bills = await res.json();
    const blob = new Blob([JSON.stringify({ bills }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bills_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('导出失败');
  }
});

document.getElementById('importBtn').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data.bills)) {
        alert('文件格式错误：缺少 bills 数组');
        return;
      }
      let count = 0;
      for (const b of data.bills) {
        if (b.date && b.company && b.quantity && b.unit_price) {
          const total = parseFloat(b.quantity) * parseFloat(b.unit_price);
          const paid = parseFloat(b.paid) || 0;
          const res = await api('/api/bills', {
            method: 'POST',
            body: {
              date: b.date,
              company: b.company,
              quantity: parseFloat(b.quantity),
              unit_price: parseFloat(b.unit_price),
              total_amount: total,
              paid: paid,
              unpaid: total - paid,
              note: b.note || ''
            }
          });
          if (res.ok) count++;
        }
      }
      alert(`成功导入 ${count} 条记录`);
      loadData();
    } catch {
      alert('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Socket.io 实时同步
function initSocket() {
  const isLocalFile = location.protocol === 'file:';
  if (isLocalFile) {
    statusEl.textContent = '请通过 http://localhost:3000 访问';
    return;
  }

  try {
    socket = io({
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });

    let wasConnected = false;

    socket.on('connect', () => {
      wasConnected = true;
      statusEl.textContent = '在线同步';
      statusEl.classList.add('online');
    });

    socket.on('disconnect', (reason) => {
      statusEl.textContent = '离线模式';
      statusEl.classList.remove('online');
      console.log('断开原因:', reason);
    });

    socket.on('connect_error', () => {
      if (!wasConnected) {
        statusEl.textContent = '连接中...';
      } else {
        statusEl.textContent = '重连中...';
      }
      statusEl.classList.remove('online');
    });

    socket.on('update', () => {
      loadData();
    });
  } catch {
    statusEl.textContent = '单机模式';
  }
}

function initApp() {
  document.getElementById('date').valueAsDate = new Date();
  loadData();
  initSocket();
}

// 初始化：已登录则进主界面，否则显示登录
if (token && currentUser) {
  showMain();
  initApp();
} else {
  showLogin();
}
