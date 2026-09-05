import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

let accessToken = null;

export const tokens = {
  get access() { return accessToken; },
  set(access) { accessToken = access; },
  clear() { accessToken = null; },
};

client.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing = null;

export async function refreshAccess() {
  refreshing = refreshing || axios.post(
    `${API_BASE}/auth/refresh/`,
    {},
    { withCredentials: true }
  );
  try {
    const { data } = await refreshing;
    accessToken = data.access;
    return data.access;
  } finally {
    refreshing = null;
  }
}

// Sign-out has to reach the server: the refresh cookie is httpOnly, so dropping
// the in-memory access token alone would leave a session the next page load
// silently resumes. Ordering matters -- POST first, redirect after.
export async function signOut() {
  try {
    await client.post("/auth/logout/");
  } catch {
    // Best effort. If the request fails the cookie may survive, but there is
    // nothing further the UI can do beyond dropping local state.
  }
  accessToken = null;
  window.location.href = "/login";
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }
    original._retried = true;
    try {
      await refreshAccess();
      return client(original);
    } catch (err) {
      accessToken = null;
      window.location.href = "/login";
      return Promise.reject(err);
    }
  }
);

export default client;