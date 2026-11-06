
const $ = (id) => document.getElementById(id);

let mode = "login";

$("loginTab").onclick = () => setMode("login");
$("registerTab").onclick = () => setMode("register");

function setMode(next) {
  mode = next;

  $("loginTab").classList.toggle("active", mode === "login");
  $("registerTab").classList.toggle("active", mode === "register");

  $("authSubmit").textContent =
    mode === "login" ? "Login" : "Register";

  $("password").autocomplete =
    mode === "login" ? "current-password" : "new-password";

  $("authMessage").textContent = "";
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  if (res.status === 204) {
    return { res, data: null };
  }

  const data = await res.json().catch(() => ({}));

  return { res, data };
}

$("authForm").onsubmit = async (e) => {
  e.preventDefault();

  $("authSubmit").disabled = true;
  $("authMessage").textContent = "";

  try {
    const endpoint =
      mode === "login" ? "/api/login" : "/api/register";

    const { res, data } = await request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: $("username").value,
        password: $("password").value
      })
    });

    if (!res.ok) {
      $("authMessage").textContent =
        data.error || "Something went wrong.";
      return;
    }

    await showTodo(data.username);
    $("authForm").reset();

  } catch (err) {
    $("authMessage").textContent = "Cannot connect to server.";
    console.error(err);
  } finally {
    $("authSubmit").disabled = false;
  }
};

$("logout").onclick = async () => {
  try {
    await request("/api/logout", {
      method: "POST"
    });

    $("todo").classList.add("hidden");
    $("auth").classList.remove("hidden");
    $("taskList").innerHTML = "";

  } catch (err) {
    console.error(err);
  }
};

$("taskForm").onsubmit = async (e) => {
  e.preventDefault();

  const title = $("taskTitle").value.trim();

  if (!title) return;

  try {
    const { res, data } = await request("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title })
    });

    if (!res.ok) {
      $("taskMessage").textContent =
        data.error || "Could not add task.";
      return;
    }

    $("taskTitle").value = "";
    $("taskMessage").textContent = "";

    await loadTasks();

  } catch (err) {
    $("taskMessage").textContent = "Cannot connect to server.";
    console.error(err);
  }
};

async function loadTasks() {
  const { res, data } = await request("/api/tasks");

  if (!res.ok) {
    $("taskMessage").textContent =
      data.error || "Could not load tasks.";
    return;
  }

  $("taskList").innerHTML = "";

  for (const task of data) {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;

    checkbox.onchange = async () => {
      try {
        const { res } = await request(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            completed: checkbox.checked
          })
        });

        if (!res.ok) {
          await loadTasks();
          return;
        }

        await loadTasks();

      } catch (err) {
        console.error(err);
      }
    };

    const span = document.createElement("span");
    span.textContent = task.title;
    span.className = task.completed ? "completed" : "";

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "delete";

    del.onclick = async () => {
      try {
        const { res } = await request(`/api/tasks/${task.id}`, {
          method: "DELETE"
        });

        if (res.ok) {
          await loadTasks();
        }

      } catch (err) {
        console.error(err);
      }
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
  try {
    const { res, data } = await request("/api/me");

    if (res.ok) {
      await showTodo(data.username);
    }
  } catch (err) {
    console.error(err);
  }
}

boot();
