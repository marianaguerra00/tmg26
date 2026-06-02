// --- CREDENCIAIS ---
const SUPABASE_URL = 'https://dbfnseioskgukskijmjj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kbCqQ36p2zzr1-emmawF2A_mc7CxpVT';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// CONFIGURAÇÃO ESTÁTICA
const cfg = {
    tables: 10,
    seatsPerTable: 12,
    eventName: 'Reserva de Lugares',
    adminCode: '2526'
};

let reservations = {};
let selectedSeat = null;

async function init() {
    document.getElementById('event-title').textContent = cfg.eventName;

    await loadReservations();
    buildSala();

    // Escuta alterações em tempo real
    client.channel('public-reservations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
            loadReservations().then(() => {
                buildSala();
                if (document.getElementById('view-admin-view').classList.contains('active') && document.getElementById('admin-panel').style.display === 'block') {
                    renderReservationsTable();
                }
            });
        })
        .subscribe();
}

async function loadReservations() {
    const { data } = await client.from('reservations').select('*');
    if (data) {
        reservations = data.reduce((acc, row) => {
            acc[row.id] = { name: row.name };
            return acc;
        }, {});
    }
}

// FUNÇÃO DE NAVEGAÇÃO REINTEGRADA
function showView(v) {
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    document.getElementById('view-' + v).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Oculta o botão "Área Restrita" se estivermos na aba de administração
    const footerAdmin = document.getElementById('footer-admin');
    if (footerAdmin) {
        footerAdmin.style.display = (v === 'admin-view') ? 'none' : 'block';
    }
}

function buildSala() {
    const sala = document.getElementById('sala');
    sala.innerHTML = '';

    const total = cfg.tables * cfg.seatsPerTable;
    const taken = Object.keys(reservations).length;

    document.getElementById('stats-bar').innerHTML = `
    <div class="stat"><div class="stat-val">${total}</div><div class="stat-lbl">Total</div></div>
    <div class="stat"><div class="stat-val" style="color:var(--green)">${total - taken}</div><div class="stat-lbl">Livres</div></div>
    <div class="stat"><div class="stat-val" style="color:var(--red)">${taken}</div><div class="stat-lbl">Ocupados</div></div>
  `;
    document.getElementById('header-subtitle').textContent = `${cfg.tables} mesas · ${cfg.seatsPerTable} lugares por mesa`;

    for (let t = 1; t <= cfg.tables; t++) {
        const wrap = document.createElement('div');
        wrap.className = 'mesa-wrap';

        const takenCount = Object.keys(reservations).filter(k => k.startsWith('t' + t + '_')).length;
        wrap.innerHTML = `<div class="mesa-label">MESA ${t}</div><div class="mesa-counter">${cfg.seatsPerTable - takenCount}/${cfg.seatsPerTable} livres</div>`;

        const mesa = document.createElement('div');
        mesa.className = 'mesa';
        const mc = document.createElement('div');
        mc.className = 'mesa-circle';
        mc.innerHTML = `Mesa<br>${t}`;
        mesa.appendChild(mc);

        const n = cfg.seatsPerTable;
        for (let s = 1; s <= n; s++) {
            const angle = ((s - 1) / n) * 2 * Math.PI - Math.PI / 2;
            const r = 52, cx = 70, cy = 70;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            const key = `t${t}_s${s}`;

            const seat = document.createElement('div');
            seat.className = 'seat';
            seat.style.left = x + 'px';
            seat.style.top = y + 'px';

            if (reservations[key]) {
                seat.classList.add('taken');
                seat.onclick = () => openInfoModal(t, s, key);
            } else {
                seat.onclick = () => openModal(t, s, key);
            }
            mesa.appendChild(seat);
        }
        wrap.appendChild(mesa);
        sala.appendChild(wrap);
    }
}

function openModal(t, s, key) {
    selectedSeat = { t, s, key };
    document.getElementById('modal-seat-info').textContent = `Mesa ${t} · Lugar ${s}`;
    document.getElementById('modal-name').value = '';
    document.getElementById('modal-overlay').classList.add('open');
    setTimeout(() => document.getElementById('modal-name').focus(), 100);
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    selectedSeat = null;
}

function getInitials(name) {
    return name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function openInfoModal(t, s, key) {
    const res = reservations[key];
    if (!res) return;
    document.getElementById('info-avatar').textContent = getInitials(res.name);
    document.getElementById('info-name').textContent = res.name;
    document.getElementById('info-seat').textContent = `Mesa ${t} · Lugar ${s}`;
    document.getElementById('info-modal-overlay').classList.add('open');
}

function closeInfoModal() {
    document.getElementById('info-modal-overlay').classList.remove('open');
}

async function confirmReservation() {
    const name = document.getElementById('modal-name').value.trim();
    if (!name) return toast('Por favor, introduz o teu nome.');
    if (!selectedSeat) return;

    // Captura o botão e ativa o estado de loading
    const btn = document.querySelector('.btn-confirm');
    const originalText = btn.textContent;
    btn.textContent = 'A processar...';
    btn.disabled = true;

    // Aguarda a resposta do servidor
    const { error } = await client.from('reservations').insert([{ id: selectedSeat.key, name: name }]);

    // Restaura o botão independentemente do resultado
    btn.textContent = originalText;
    btn.disabled = false;

    if (error) {
        if (error.code === '23505') toast('Lugar ou nome já registado.');
        else toast('Erro de comunicação. Tenta novamente.');
        return;
    }

    closeModal();
    toast(`Reserva efetuada para ${name}.`);
}

// ADMINISTRAÇÃO
function checkAdmin() {
    const val = document.getElementById('admin-code-input').value;
    if (val === cfg.adminCode) {
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'block';
        renderReservationsTable();
    } else {
        toast('Código incorreto.');
    }
}

function renderReservationsTable() {
    const tbody = document.getElementById('res-tbody');
    const entries = Object.entries(reservations);
    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1rem">Nenhuma reserva</td></tr>';
        return;
    }
    tbody.innerHTML = entries.map(([key, v]) => {
        const [tm, sm] = key.split('_');
        return `<tr><td>${v.name}</td><td>${tm.replace('t', 'Mesa ')}</td><td>Lugar ${sm.replace('s', '')}</td><td><button class="del-btn" onclick="deleteReservation('${key}')">Apagar</button></td></tr>`;
    }).join('');
}

async function deleteReservation(key) {
    if (!confirm('Apagar esta reserva?')) return;
    const { error } = await client.from('reservations').delete().eq('id', key);
    if (error) toast('Erro ao apagar.');
    else toast('Reserva apagada.');
}

async function clearAll() {
    if (!confirm('Tem a certeza que quer apagar TODAS as reservas?')) return;
    const { error } = await client.from('reservations').delete().neq('id', '0');
    if (error) toast('Erro ao limpar base de dados.');
    else toast('Todas as reservas apagadas.');
}

function exportCSV() {
    const rows = [['Nome', 'Mesa', 'Lugar']];
    Object.entries(reservations).forEach(([key, v]) => {
        const [tm, sm] = key.split('_');
        rows.push([v.name, tm.replace('t', 'Mesa '), sm.replace('s', 'Lugar ')]);
    });
    const csv = rows.map(r => r.map(c => '"' + c + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'reservas_gala.csv';
    a.click();
}

function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
}

document.getElementById('modal-overlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
document.getElementById('info-modal-overlay').addEventListener('click', function (e) { if (e.target === this) closeInfoModal(); });

init();