const form = document.getElementById('billForm');
const tableBody = document.getElementById('billTableBody');
const emptyTip = document.getElementById('emptyTip');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const formTitle = document.getElementById('formTitle');

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
      fetch(`/api/bills?${params}`),
      fetch('/api/stats'),
      fetch('/api/companies')
    ]);

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

  bills.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${b.date}</td>
      <td>${escapeHtml(b.company)}</td>
      <td>${formatNum(b.quantity)}</td>
      <td>${formatMoney(b.unit_price)}</td>
      <td>${formatMoney(b.total_amount)}</td>
      <td>${formatMoney(b.paid)}</td>
      <td class="${b.unpaid > 0 ? 'unpaid' : ''}">${formatMoney(b.unpaid)}</td>
      <td class="note" title="${escapeHtml(b.note)}">${escapeHtml(b.note)}</td>
      <td>
        <button class="danger" onclick="startEdit(${b.id})">编辑</button>
        <button class="danger" onclick="deleteBill(${b.id})">删除</button>
      </td>
    `;
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
  const qty = parseFloat(document.getElementById('quantity').value) || 0;
  const price = parseFloat(document.getElementById('unitPrice').value) || 0;
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
    const res = await fetch('/api/bills');
    const bills = await res.json();
    const b = bills.find(x => x.id === id);
    if (!b) return;

    document.getElementById('date').value = b.date;
    document.getElementById('company').value = b.company;
    document.getElementById('quantity').value = b.quantity;
    document.getElementById('unitPrice').value = b.unit_price;
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
    await fetch(`/api/bills/${id}`, { method: 'DELETE' });
    loadData();
  } catch (err) {
    alert('删除失败');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const quantity = parseFloat(document.getElementById('quantity').value) || 0;
  const unitPrice = parseFloat(document.getElementById('unitPrice').value) || 0;
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
    if (editingId) {
      await fetch(`/api/bills/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bill)
      });
    } else {
      await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bill)
      });
    }
    resetForm();
    loadData();
  } catch (err) {
    alert('保存失败');
  }
});

cancelBtn.addEventListener('click', resetForm);

['quantity', 'unitPrice', 'paid'].forEach(id => {
  document.getElementById(id).addEventListener('input', updatePreview);
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
    const res = await fetch('/api/bills');
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
          await fetch('/api/bills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: b.date,
              company: b.company,
              quantity: parseFloat(b.quantity),
              unit_price: parseFloat(b.unit_price),
              total_amount: total,
              paid: paid,
              unpaid: total - paid,
              note: b.note || ''
            })
          });
          count++;
        }
      }
      alert(`成功导入 ${count} 条记录`);
      loadData();
    } catch (err) {
      alert('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Socket.io 实时同步
const isLocalFile = location.protocol === 'file:';

if (isLocalFile) {
  statusEl.textContent = '请通过 http://localhost:3000 访问';
} else {
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

document.getElementById('date').valueAsDate = new Date();
loadData();
