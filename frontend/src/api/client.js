import axios from "axios";

const client = axios.create({ baseURL: "/api" });

export const tokens = {
  get access() { return localStorage.getItem("kachau:access"); },
  get refresh() { return localStorage.getItem("kachau:refresh"); },
  set(access, refresh) {
    localStorage.setItem("kachau:access", access);
    if (refresh) localStorage.setItem("kachau:refresh", refresh);
  },
  clear() {
    localStorage.removeItem("kachau:access");
    localStorage.removeItem("kachau:refresh");
  },
};

client.interceptors.request.use((config) => {
  const token = tokens.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }
    if (!tokens.refresh) {
      tokens.clear();
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      refreshing = refreshing || axios.post("/api/auth/refresh/", {
        refresh: tokens.refresh,
      });
      const { data } = await refreshing;
      refreshing = null;
      tokens.set(data.access, data.refresh);
      return client(original);
    } catch (err) {
      refreshing = null;
      tokens.clear();
      window.location.href = "/login";
      return Promise.reject(err);
    }
  }
);

export default client;