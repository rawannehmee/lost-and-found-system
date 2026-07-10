// app.js - frontend logic
// Talks to the Express REST API with fetch(), exchanging JSON.

const API = "/api/items";

// State

const state = { type: "", category: "", status: "", q: "" };

// Elements

const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const resultCount = document.getElementById("result-count");
const dlgForm = document.getElementById("dlg-form");
const dlgDetail = document.getElementById("dlg-detail");
const form = document.getElementById("item-form");
const formError = document.getElementById("form-error");


// API client

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    const message = data.errors ? data.errors.join("\n") : data.error;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return data;
}

const getItems  = ()          => apiRequest(`${API}?${buildQuery()}`);          // GET (list)
const getItem   = (id)        => apiRequest(`${API}/${id}`);                    // GET (one)
const createItem = (body)     => apiRequest(API, { method: "POST", body: JSON.stringify(body) });   // POST
const updateItem = (id, body) => apiRequest(`${API}/${id}`, { method: "PUT", body: JSON.stringify(body) }); // PUT
const deleteItem = (id)       => apiRequest(`${API}/${id}`, { method: "DELETE" });                  // DELETE

function buildQuery() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value) params.set(key, value);
  return params.toString();
}

// Rendering

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const serial = (id) => `LF-${String(id).padStart(4, "0")}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function tagCard(item) {
  return `
    <button class="tag-card ${item.type} ${item.status === "resolved" ? "resolved" : ""}" data-id="${item.id}">
      <span class="tag-stub">
        <span class="tag-hole" aria-hidden="true"></span>
        <span class="tag-type">${item.type}</span>
        ${item.status === "resolved" ? '<span class="badge-resolved">Resolved</span>' : ""}
        <span class="tag-serial">${serial(item.id)}</span>
      </span>
      <span class="tag-body">
        <span class="tag-title">${esc(item.title)}</span>
        <span class="tag-desc">${esc(item.description)}</span>
        <span class="tag-meta">
          <span>${esc(item.location)}</span>
          <span>${esc(item.date)}</span>
        </span>
      </span>
    </button>`;
}

async function render() {
  try {
    const items = await getItems();
    grid.innerHTML = items.map(tagCard).join("");
    empty.hidden = items.length > 0;
    resultCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"} on the board`;
  } catch (err) {
    grid.innerHTML = "";
    empty.hidden = false;
    empty.querySelector("p:last-child").textContent =
      `Couldn't load items: ${err.message}. Is the server running?`;
  }
}


// Detail dialog

async function openDetail(id) {
  const item = await getItem(id);
  dlgDetail.innerHTML = `
    <div class="detail">
      <div class="detail-head">
        <span class="tag-type" style="color:var(--${item.type}); background:var(--${item.type}-soft)">${item.type}</span>
        <h2>${esc(item.title)}</h2>
        <span class="tag-serial">${serial(item.id)}</span>
      </div>
      ${item.description ? `<p>${esc(item.description)}</p>` : ""}
      <dl>
        <dt>Category</dt><dd>${cap(item.category)}</dd>
        <dt>Location</dt><dd>${esc(item.location)}</dd>
        <dt>Date</dt><dd class="mono">${esc(item.date)}</dd>
        <dt>Status</dt><dd>${cap(item.status)}</dd>
        <dt>Contact</dt><dd>${esc(item.contact_name)} (${esc(item.contact_info)})</dd>
        <dt>Posted</dt><dd class="mono">${esc(item.created_at)} UTC</dd>
      </dl>
      <div class="dialog-actions">
        <button class="btn btn-danger" id="btn-delete">Delete</button>
        <button class="btn btn-ghost" id="btn-edit">Edit</button>
        ${item.status === "open"
          ? '<button class="btn btn-resolve" id="btn-resolve">Mark resolved</button>'
          : '<button class="btn btn-ghost" id="btn-reopen">Reopen</button>'}
        <button class="btn btn-primary" id="btn-close">Close</button>
      </div>
    </div>`;
  dlgDetail.showModal();

  dlgDetail.querySelector("#btn-close").onclick = () => dlgDetail.close();
  dlgDetail.querySelector("#btn-edit").onclick = () => { dlgDetail.close(); openForm(item); };
  const resolveBtn = dlgDetail.querySelector("#btn-resolve");
  if (resolveBtn) resolveBtn.onclick = async () => {
    await updateItem(item.id, { status: "resolved" });   // PUT
    dlgDetail.close(); render();
  };
  const reopenBtn = dlgDetail.querySelector("#btn-reopen");
  if (reopenBtn) reopenBtn.onclick = async () => {
    await updateItem(item.id, { status: "open" });       // PUT
    dlgDetail.close(); render();
  };
  dlgDetail.querySelector("#btn-delete").onclick = async () => {
    if (!confirm(`Delete "${item.title}" from the board? This can't be undone.`)) return;
    await deleteItem(item.id);                           // DELETE
    dlgDetail.close(); render();
  };
}


// Report / edit form

function openForm(item = null) {
  form.reset();
  formError.hidden = true;
  document.getElementById("f-id").value = item ? item.id : "";
  document.getElementById("form-title").textContent = item ? `Edit ${serial(item.id)}` : "Report an item";
  document.getElementById("btn-save").textContent = item ? "Save changes" : "Post to board";
  if (item) {
    form.elements.type.value = item.type;
    document.getElementById("f-title").value = item.title;
    document.getElementById("f-description").value = item.description;
    document.getElementById("f-category").value = item.category;
    document.getElementById("f-date").value = item.date;
    document.getElementById("f-location").value = item.location;
    document.getElementById("f-contact-name").value = item.contact_name;
    document.getElementById("f-contact-info").value = item.contact_info;
  } else {
    document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
  }
  dlgForm.showModal();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.getElementById("f-id").value;
  const body = {
    type: form.elements.type.value,
    title: document.getElementById("f-title").value.trim(),
    description: document.getElementById("f-description").value.trim(),
    category: document.getElementById("f-category").value,
    date: document.getElementById("f-date").value,
    location: document.getElementById("f-location").value.trim(),
    contact_name: document.getElementById("f-contact-name").value.trim(),
    contact_info: document.getElementById("f-contact-info").value.trim(),
  };
  try {
    if (id) await updateItem(id, body);   // PUT
    else await createItem(body);          // POST
    dlgForm.close();
    render();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  }
});


// Events: tabs, filters, search (debounced), open/close

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");
    state.type = tab.dataset.type;
    render();
  });
});

document.getElementById("filter-category").addEventListener("change", (e) => {
  state.category = e.target.value; render();
});
document.getElementById("filter-status").addEventListener("change", (e) => {
  state.status = e.target.value; render();
});

let searchTimer;
document.getElementById("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 250);
});

grid.addEventListener("click", (e) => {
  const card = e.target.closest(".tag-card");
  if (card) openDetail(Number(card.dataset.id));
});

document.getElementById("btn-report").addEventListener("click", () => openForm());
document.getElementById("btn-cancel").addEventListener("click", () => dlgForm.close());

// Initial load
render();
