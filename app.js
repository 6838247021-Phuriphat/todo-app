const $ = (id) => document.getElementById(id);

let mode = "login";

$("loginTab").onclick = () => setMode("login");
$("registerTab").onclick = () => setMode("register");

function setMode(next) {
  mode = next;
  $("loginTab").classList.toggle("active", mode === "login");
  $("registerTab").classList.toggle("active", mode === "register");
  $("authSubmit").textContent = mode === "login" ? "Login" : "Register";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("authMessage").textContent = "";
}

$("authForm").onsubmit = async (e) => {
  e.preventDefault();
  const endpoint = mode === "login" ? "/api/login" : "/api/register";
  const body = {
    username: $("username").value,
    password: $("password").value
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    credentials: "include",
    body: JSON.stringify(body)
  });
  const data = await res.json();

  if (!res.ok) {
    $("authMessage").textContent = data.error || "Something went wrong.";
    return;
  }

  await showTodo(data.username);
  $("authForm").reset();
};

$("logout").onclick = async () => {
  await fetch("/api/logout", { method: "POST", credentials: "include" });
  $("todo").classList.add("hidden");
  $("auth").classList.remove("hidden");
};

$("taskForm").onsubmit = async (e) => {
  e.preventDefault();
  const title = $("taskTitle").value.trim();
  if (!title) return;

  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    credentials: "include",
    body: JSON.stringify({ title })
  });
  const data = await res.json();

  if (!res.ok) {
    $("taskMessage").textContent = data.error || "Could not add task.";
    return;
  }

  $("taskTitle").value = "";
  $("taskMessage").textContent = "";
  await loadTasks();
};

async function loadTasks() {
  const res = await fetch("/api/tasks", { credentials: "include" });
  if (!res.ok) return;
  const tasks = await res.json();

  $("taskList").innerHTML = "";
  for (const task of tasks) {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.onchange = async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        credentials: "include",
        body: JSON.stringify({ completed: checkbox.checked })
      });
      await loadTasks();
    };

    const span = document.createElement("span");
    span.textContent = task.title;
    span.className = task.completed ? "completed" : "";

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "delete";
    del.onclick = async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      await loadTasks();
    };

    li.append(checkbox, span, del);
    $("taskList").appendChild(li);
  }
}

async function showTodo(username) {
  $("currentUser").textContent = username;
  $("auth").classList.add("hidden");
  $("todo").classList.remove("hidden");
  await loadTasks();
}

async function boot() {
  const res = await fetch("/api/me", { credentials: "include" });
  if (res.ok) {
    const data = await res.json();
    await showTodo(data.username);
  }
}
boot();